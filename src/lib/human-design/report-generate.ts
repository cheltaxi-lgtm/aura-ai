import { completeChatDetailed, type ChatMessage } from "@/lib/llm";
import { getHdModel } from "@/lib/ai-model";
import { HD_COMPOSITE_REQUIRED_SECTIONS, HD_REPORT_REQUIRED_SECTIONS } from "./packages";
import { stripHdMetaLeak } from "./prompt";
import { validateHdReportText, hdSectionMinimumChars, type HdQualityFinding } from "@/lib/hd-report-quality/validator";
import { buildHdLockedContract, type HdLockedContract } from "@/lib/hd-report-pipeline/contract";
import type { HdChart } from "./types";
import { buildHdConnectionReportContract, type HdConnectionReportContract } from "./connection";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Min body length (chars) for a required ## section to count as written. */

/** Title may be followed by whitespace, EOL, or light punctuation (incl. `:`). */
const HD_HEADING_TAIL = "(?:\\s|$|[.!?…:])";

/** Strip trailing punctuation so `## Title:` and `## Title` share one key. */
export function normalizeHdHeadingTitle(raw: string): string {
  return raw.trim().replace(/[.!?…:]+$/u, "").trim();
}

/** Which required ## headings are still missing from a draft. */
export function missingHdReportSections(
  text: string,
  required: readonly string[] = HD_REPORT_REQUIRED_SECTIONS
): string[] {
  const body = text || "";
  // Avoid \\b — JS word boundaries do not treat Cyrillic as word chars.
  return required.filter(
    (title) => !new RegExp(`^##\\s*${escapeRe(title)}${HD_HEADING_TAIL}`, "im").test(body)
  );
}

/**
 * Required sections that exist only as a stub/placeholder (heading present,
 * body tiny) — the classic "plan with headings, promise to continue" leak.
 * Uses the longest body for a title (after punctuation normalize).
 */
function thinHdReportSections(text: string, required: readonly string[]): string[] {
  const body = text || "";
  return required.filter((title) => {
    const re = new RegExp(`^##\\s*${escapeRe(title)}${HD_HEADING_TAIL}`, "gim");
    let bestLen = 0;
    let matched = false;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      matched = true;
      const rest = body.slice(m.index + m[0].length);
      // Do not stop at ### (subsection) — only real ## headings.
      const nextHeading = rest.search(/^##(?!#)\s+/m);
      const sectionBody = (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
      bestLen = Math.max(bestLen, sectionBody.length);
    }
    return matched && bestLen < hdSectionMinimumChars(title);
  });
}

/**
 * Continuation passes append rewritten sections after the stub. Keep the
 * longest body per ## heading (punctuation-normalized) so a stub
 * `## Title:` never survives beside a full `## Title`.
 */
export function dedupeHdSections(text: string): string {
  const lines = text.split("\n");
  const intro: string[] = [];
  const sections: Array<{ title: string; key: string; body: string[] }> = [];
  let current: { title: string; key: string; body: string[] } | null = null;
  for (const line of lines) {
    const h = /^##(?!#)\s+(.+)$/.exec(line);
    if (h) {
      const raw = h[1].trim();
      const key = normalizeHdHeadingTitle(raw);
      current = { title: key || raw, key: key || raw, body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    } else {
      intro.push(line);
    }
  }
  if (!sections.length) return text.trim();
  const bestByKey = new Map<string, { title: string; key: string; body: string[] }>();
  for (const s of sections) {
    const prev = bestByKey.get(s.key);
    const len = s.body.join("\n").trim().length;
    if (!prev || len > prev.body.join("\n").trim().length) bestByKey.set(s.key, s);
  }
  const seen = new Set<string>();
  const ordered = sections.filter((s) => {
    if (seen.has(s.key) || bestByKey.get(s.key) !== s) return false;
    seen.add(s.key);
    return true;
  });
  const parts: string[] = [];
  const introText = intro.join("\n").trim();
  if (introText) parts.push(introText);
  for (const s of ordered) {
    parts.push(`## ${s.title}\n${s.body.join("\n").trim()}`.trim());
  }
  return parts.join("\n\n");
}

function buildContinuePrompt(missing: string[]): string {
  const list = missing.map((t) => `## ${t}`).join("\n");
  return (
    `Текст разбора выше ещё неполный — оборвался или пропущены разделы.\n` +
    `Продолжи РОВНО с места остановки. Не повторяй уже написанные разделы.\n` +
    `Обязательно допиши ВСЕ недостающие разделы с этими точными заголовками ##:\n${list}\n\n` +
    `В каждом новом разделе: механика → жизнь → 1–2 бытовых примера → что делать. ` +
    `Для «Девять центров» и «Каналы» используй ### на каждый центр/канал. ` +
    `Пиши развёрнуто — это полный премиальный продукт, не краткое резюме.`
  );
}

function buildExpandPrompt(thin: string[]): string {
  const list = thin.map((t) => `## ${t}`).join("\n");
  return (
    `Эти разделы написаны формально, планом или заменены служебным комментарием — так нельзя, клиент платит за полный продукт.\n` +
    `Перепиши каждый из них ПОЛНОСТЬЮ и развёрнуто, с точными заголовками ##:\n${list}\n\n` +
    `В каждом: механика из данных → проявление в жизни → 1–2 конкретных бытовых примера → чёткое «что делать». ` +
    `Никаких обещаний продолжить и комментариев о структуре — только сам текст разбора.`
  );
}

/** Factual repairs retain section order and replace the unheaded introduction too. */
function replaceHdFactualSections(original: string, rewrite: string, titles: string[]): string {
  const parse = (text: string) => {
    const pieces = text.split(/^##(?!#)\s+/m);
    const intro = pieces.shift()!.trim();
    const sections = pieces.map(piece => {
      const newline = piece.indexOf("\n");
      return { title: normalizeHdHeadingTitle(newline < 0 ? piece : piece.slice(0,newline)), body: newline < 0 ? "" : piece.slice(newline+1).trim() };
    });
    return { intro, sections };
  };
  const before = parse(original), after = parse(rewrite);
  const replacements = new Map(after.sections.filter(s => titles.includes(s.title)).map(s => [s.title,s]));
  if (titles.includes("Вступление") && after.intro) replacements.set("Вступление",{title:"Вступление",body:after.intro});
  const introReplacement = replacements.get("Вступление");
  const intro = introReplacement?.body ?? before.intro;
  const handled = new Set<string>(introReplacement ? ["Вступление"] : []);
  const result = before.sections.flatMap(section => {
    if (introReplacement && section.title === "Вступление") return [];
    const replacement = replacements.get(section.title);
    if (replacement) handled.add(section.title);
    return [replacement ?? section];
  });
  for (const section of after.sections) if (!handled.has(section.title)) result.push(section);
  const extraIntro = after.intro && !titles.includes("Вступление") ? after.intro : "";
  return [intro,extraIntro,...result.map(s => `## ${s.title}\n${s.body}`)].filter(Boolean).join("\n\n");
}

/**
 * Shared multi-pass generator: high token budget + continue until all
 * required ## sections exist or passes are exhausted.
 */
async function completeSectionedReport(opts: {
  systemPrompt: string;
  seedUserText: string;
  required: readonly string[];
  pass0MaxTokens: number;
  continueMaxTokens: number;
  deadlineAt: number;
  contract?: HdLockedContract;
  connectionContract?: HdConnectionReportContract;
  beforeRequest?: () => Promise<void>;
}): Promise<string | null> {
  const system: ChatMessage = { role: "system", content: opts.systemPrompt };
  const seedUser: ChatMessage = { role: "user", content: opts.seedUserText };
  const hdModel = await getHdModel();

  let combined = "";
  let lastTruncated = true;
  let repairTitles: string[] = [];
  let repairFindings: HdQualityFinding[] = [];
  let fullRewrite = false;
  const allowedTitles = new Set(["Вступление",...opts.required]);
  // Durable diagnostics contain rule codes and canonical sections, never prose,
  // subject names, birth identity or a copy of the provider response.
  const diagnostic = (findings: HdQualityFinding[]) => findings.slice(0,24).map(f=>({
    rule:f.rule,kind:/^[a-z_]+/u.exec(f.detail)?.[0] ?? "unknown",
    sections:(f.sectionTitles ?? []).filter(title=>allowedTitles.has(title)),
  }));
  // 6 passes: stochastic near-threshold rejects (thin 3/16 after 4 passes)
  // refund a paying user; two extra expand passes usually fix the last stubs.
  const maxPasses = 6;

  for (let pass = 0; pass < maxPasses; pass++) {
    if (Date.now() >= opts.deadlineAt) break;
    const messages: ChatMessage[] =
      pass === 0
        ? [system, seedUser]
        : [
            system,
            seedUser,
            { role: "assistant", content: combined },
            {
              role: "user",
              content: (() => {
                if (repairTitles.length) return `${fullRewrite ? "Перепиши разбор целиком, удалив ошибочные дополнительные разделы. " : ""}Исправь перечисленные нарушения проверки: ${repairFindings.slice(0,24).map(f=>`${f.rule}: ${f.detail.slice(0,500)}`).join("; ")}. Для фактов следуй исходным расчётным данным; для служебных слов и разметки убери дефект; для повторов напиши разные объяснения. ${buildExpandPrompt(repairTitles)}`;
                const missing = missingHdReportSections(combined, opts.required);
                if (missing.length) return buildContinuePrompt(missing);
                // Measure thin on the deduped view: the first regex hit in the
                // raw text is always the original stub, even after a good
                // rewrite exists later — expanding the same stub forever.
                const thin = thinHdReportSections(dedupeHdSections(combined), opts.required);
                if (thin.length) return buildExpandPrompt(thin);
                return "Текст оборвался на лимите. Продолжи ровно с места остановки без повтора. Допиши оставшиеся разделы до полного премиального объёма.";
              })(),
            },
          ];

    // 12k tokens of Russian prose takes minutes — the default 120s aborts
    // mid-draft and the whole report is lost. Retry the pass once on empty.
    // skipDegenerateCheck: HD practices / parallel day blocks trip chat spam
    // heuristics (repeated lines, numbered density). Product gate below owns quality.
    const maxTokens = pass === 0 || fullRewrite ? opts.pass0MaxTokens : opts.continueMaxTokens;
    let result = await completeChatDetailed({
      messages,
      maxTokens,
      temperature: 0.62,
      modelOverride: hdModel,
      timeoutMs: 300_000,
      skipTemperatureRetry: true,
      skipDegenerateCheck: true,
      priority: "report",
      maxAttempts: 1,
      deadlineAt: opts.deadlineAt,
      beforeRequest: opts.beforeRequest,
    });
    let chunk = (result.text || "").trim();
    if (!chunk && Date.now() < opts.deadlineAt) {
      console.warn("[hd-generate] empty chunk, retrying pass", { pass });
      result = await completeChatDetailed({
        messages,
        maxTokens,
        temperature: 0.62,
        modelOverride: hdModel,
        timeoutMs: 300_000,
        skipTemperatureRetry: true,
        skipDegenerateCheck: true,
        priority: "report",
        maxAttempts: 1,
        deadlineAt: opts.deadlineAt,
        beforeRequest: opts.beforeRequest,
      });
      chunk = (result.text || "").trim();
    }
    if (!chunk) {
      console.warn("[hd-generate] abort: two empty passes", { pass });
      break;
    }

    // Strip meta-leak immediately so a "plan + promise to continue" chunk
    // can never satisfy the required-sections check by listing headings.
    // A factual repair replaces its old section even when the correct prose is shorter.
    // Longest-wins deduplication is only appropriate for expanding thin stubs.
    combined = stripHdMetaLeak(fullRewrite ? chunk : repairTitles.length
      ? replaceHdFactualSections(combined,chunk,repairTitles)
      : combined ? `${combined.trim()}\n\n${chunk}` : chunk);
    repairTitles = [];
    repairFindings = [];
    fullRewrite = false;

    const missing = missingHdReportSections(combined, opts.required);
    const thin = missing.length === 0 ? thinHdReportSections(dedupeHdSections(combined), opts.required) : [];
    const hitLength = result.finishReason === "length";
    lastTruncated = result.finishReason !== "stop";
    console.warn("[hd-generate] pass done", {
      pass,
      chunkLen: chunk.length,
      finishReason: result.finishReason,
      missing: missing.length,
      thin: thin.length,
    });
    if (!lastTruncated && missing.length === 0 && thin.length === 0) {
      const candidate = dedupeHdSections(combined);
      const quality = validateHdReportText(candidate, { contract: opts.contract, connectionContract: opts.connectionContract, requiredSections: opts.required, requireFocusAnswer: false });
      if (quality.ok) return candidate;
      console.warn("[hd-generate] quality rejected",{pass,findings:diagnostic(quality.findings)});
      // Replace the defective sections instead of returning structurally complete but false prose.
      // A global defect has no section attribution; rewrite the report rather
      // than repeatedly appending a continuation to a complete bad draft.
      const global = quality.findings.some(f=>!f.sectionTitles?.length);
      fullRewrite = global;
      const titles = global ? [...allowedTitles] : [...new Set(quality.findings.flatMap(f => f.sectionTitles ?? []))];
      repairTitles = titles;
      repairFindings = quality.findings;
      if (titles.length) seedUser.content += `\nИсправь следующие разделы при продолжении: ${titles.join(", ")}. Не нарушай исходные расчётные данные.`;
    }
  }

  const finalText = dedupeHdSections(stripHdMetaLeak(combined)).trim();
  if (!finalText) {
    console.warn("[hd-generate] reject: empty after passes");
    return null;
  }
  // Quality gate: never SAVE a plan/stub as a paid report. Missing required
  // sections or too many stubs → reject (the route refunds / resumes free).
  const missingFinal = missingHdReportSections(finalText, opts.required);
  const thinFinal = thinHdReportSections(finalText, opts.required);
  const quality = validateHdReportText(finalText, { contract: opts.contract, connectionContract: opts.connectionContract, requiredSections: opts.required, requireFocusAnswer: false });
  if (lastTruncated || missingFinal.length > 0 || thinFinal.length > 0 || !quality.ok) {
    console.warn("[hd-generate] reject: gate", {
      missing: missingFinal,
      thin: thinFinal,
      truncated:lastTruncated,
      findings:diagnostic(quality.findings),
    });
    return null;
  }
  return finalText;
}

/**
 * Fat HD personal report: high token budget + continue until all ##
 * sections exist or passes are exhausted.
 */
export async function completeHdFullReport(opts: {
  systemPrompt: string;
  evidence: string;
  clientName: string | null;
  aboutOther?: boolean;
  /** Practitioner / client focus question — weave through the whole report. */
  focusQuestion?: string | null;
  chart?: HdChart;
  deadlineAt?: number;
  beforeRequest?: () => Promise<void>;
}): Promise<string | null> {
  const who = opts.clientName ?? "клиента";
  const focus = opts.focusQuestion?.trim() || "";
  const focusBlock = focus
    ? `\nФОКУС ЗАПРОСА (сквозная тема всего разбора):\n«${focus}»\n` +
      (opts.aboutOther
        ? `Разбор о другом человеке: ответь, как его механика связана с этим фокусом для читателя.\n`
        : `Читатель — носитель карты. Если фокус сформулирован в 3-м лице («у неё/него») — это всё равно ЕГО/ЕЁ запрос: пиши на «Вы».\n`) +
      `Во вступлении и в разделе «Отношения» явно разверни ответ на фокус через тип/стратегию/авторитет/профиль/центры/каналы (минимум 6–10 абзацев в «Отношения»). ` +
      `Без «да/нет», без сроков, без воды — только понятная механика и практические шаги.\n`
    : "";
  const seedUserText =
    `РАСЧЁТНЫЕ ДАННЫЕ:\n${opts.evidence}\n\n` +
    focusBlock +
    (opts.aboutOther
      ? `Напиши ПОЛНЫЙ премиальный разбор Дизайна Человека о человеке по имени ${who} — для читателя, который хочет глубоко понять этого человека.\n`
      : `Напиши ПОЛНЫЙ премиальный разбор Дизайна Человека для ${who}. Обращайся на «Вы», по имени. Не пиши в третьем лице.\n`) +
    `Это единственная покупка клиента — глубина уровня полной расшифровки конкурентов (все обязательные ## из системного промпта).\n` +
    `Не сокращай. Не пропускай разделы. Цель: 5500–8000 слов, с ### внутри Центров и Каналов.\n` +
    `В прозе разделов избегай жирного markdown (**…**): подчёркивай смысл словами, не звёздочками.`;

  return completeSectionedReport({
    systemPrompt: opts.systemPrompt,
    seedUserText,
    required: HD_REPORT_REQUIRED_SECTIONS,
    pass0MaxTokens: 12_000,
    continueMaxTokens: 8_000,
    deadlineAt: Math.min(opts.deadlineAt ?? Infinity, Date.now() + 720_000),
    contract: opts.chart ? buildHdLockedContract(opts.chart) : undefined,
    beforeRequest: opts.beforeRequest,
  });
}

/**
 * Fat HD composite (Connection Chart) report — same premium multi-pass
 * discipline as the personal report: all ## sections or continue.
 */
export async function completeHdCompositeReport(opts: {
  systemPrompt: string;
  evidence: string;
  nameA: string;
  nameB: string;
  charts: { a: HdChart; b: HdChart };
  deadlineAt?: number;
  beforeRequest?: () => Promise<void>;
}): Promise<string | null> {
  const seedUserText =
    `РАСЧЁТНЫЕ ДАННЫЕ И МЕХАНИКА СВЯЗИ:\n${opts.evidence}\n\n` +
    `Напиши ПОЛНЫЙ премиальный разбор карты связи для ${opts.nameA} и ${opts.nameB}.\n` +
    `Это единственная покупка — глубина уровня лучших платных отчётов о совместимости (все обязательные ## из системного промпта).\n` +
    `Не сокращай. Не пропускай разделы. Цель: 4000–6000 слов, с ### внутри «Электромагнетика» и «Общие каналы и язык близости».`;

  return completeSectionedReport({
    systemPrompt: opts.systemPrompt,
    seedUserText,
    required: HD_COMPOSITE_REQUIRED_SECTIONS,
    pass0MaxTokens: 12_000,
    continueMaxTokens: 8_000,
    deadlineAt: Math.min(opts.deadlineAt ?? Infinity, Date.now() + 540_000),
    beforeRequest: opts.beforeRequest,
    connectionContract: buildHdConnectionReportContract(opts.charts.a, opts.charts.b, { a: opts.nameA, b: opts.nameB }),
  });
}
