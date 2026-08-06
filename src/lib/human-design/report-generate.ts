import { completeChatDetailed, type ChatMessage } from "@/lib/llm";
import { HD_COMPOSITE_REQUIRED_SECTIONS, HD_REPORT_REQUIRED_SECTIONS } from "./packages";
import { stripHdMetaLeak } from "./prompt";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Min body length (chars) for a required ## section to count as written. */
const MIN_SECTION_BODY_CHARS = 260;
/** How many thin sections we tolerate after all passes before rejecting. */
const MAX_THIN_AFTER_PASSES = 2;

/** Which required ## headings are still missing from a draft. */
export function missingHdReportSections(
  text: string,
  required: readonly string[] = HD_REPORT_REQUIRED_SECTIONS
): string[] {
  const body = text || "";
  // Avoid \\b — JS word boundaries do not treat Cyrillic as word chars.
  return required.filter(
    (title) => !new RegExp(`^##\\s*${escapeRe(title)}(?:\\s|$|[.!?…])`, "im").test(body)
  );
}

/**
 * Required sections that exist only as a stub/placeholder (heading present,
 * body tiny) — the classic "plan with headings, promise to continue" leak.
 */
function thinHdReportSections(text: string, required: readonly string[]): string[] {
  const body = text || "";
  return required.filter((title) => {
    const re = new RegExp(`^##\\s*${escapeRe(title)}(?:\\s|$|[.!?…])`, "im");
    const m = re.exec(body);
    if (!m) return false;
    const rest = body.slice(m.index + m[0].length);
    const nextHeading = rest.search(/^##\s+/m);
    const sectionBody = (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
    return sectionBody.length < MIN_SECTION_BODY_CHARS;
  });
}

/**
 * Continuation passes append rewritten sections after the stub. Keep the
 * longest body per ## heading so the client never sees the stub.
 */
function dedupeHdSections(text: string): string {
  const lines = text.split("\n");
  const intro: string[] = [];
  const sections: Array<{ title: string; body: string[] }> = [];
  let current: { title: string; body: string[] } | null = null;
  for (const line of lines) {
    const h = /^##\s+(.+)$/.exec(line);
    if (h) {
      current = { title: h[1].trim(), body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    } else {
      intro.push(line);
    }
  }
  if (!sections.length) return text.trim();
  const bestByTitle = new Map<string, { title: string; body: string[] }>();
  for (const s of sections) {
    const prev = bestByTitle.get(s.title);
    const len = s.body.join("\n").trim().length;
    if (!prev || len > prev.body.join("\n").trim().length) bestByTitle.set(s.title, s);
  }
  const seen = new Set<string>();
  const ordered = sections.filter((s) => {
    if (seen.has(s.title) || bestByTitle.get(s.title) !== s) return false;
    seen.add(s.title);
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
}): Promise<string | null> {
  const system: ChatMessage = { role: "system", content: opts.systemPrompt };
  const seedUser: ChatMessage = { role: "user", content: opts.seedUserText };

  let combined = "";
  const maxPasses = 4;

  for (let pass = 0; pass < maxPasses; pass++) {
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
                const missing = missingHdReportSections(combined, opts.required);
                if (missing.length) return buildContinuePrompt(missing);
                const thin = thinHdReportSections(combined, opts.required);
                if (thin.length) return buildExpandPrompt(thin);
                return "Текст оборвался на лимите. Продолжи ровно с места остановки без повтора. Допиши оставшиеся разделы до полного премиального объёма.";
              })(),
            },
          ];

    // 12k tokens of Russian prose takes minutes — the default 120s aborts
    // mid-draft and the whole report is lost. Retry the pass once on empty.
    let result = await completeChatDetailed({
      messages,
      maxTokens: pass === 0 ? opts.pass0MaxTokens : opts.continueMaxTokens,
      temperature: 0.62,
      isPaid: true,
      timeoutMs: 300_000,
      skipTemperatureRetry: true,
    });
    let chunk = (result.text || "").trim();
    if (!chunk) {
      console.warn("[hd-generate] empty chunk, retrying pass", { pass });
      result = await completeChatDetailed({
        messages,
        maxTokens: pass === 0 ? opts.pass0MaxTokens : opts.continueMaxTokens,
        temperature: 0.62,
        isPaid: true,
        timeoutMs: 300_000,
        skipTemperatureRetry: true,
      });
      chunk = (result.text || "").trim();
    }
    if (!chunk) {
      console.warn("[hd-generate] abort: two empty passes", { pass });
      break;
    }

    // Strip meta-leak immediately so a "plan + promise to continue" chunk
    // can never satisfy the required-sections check by listing headings.
    combined = stripHdMetaLeak(combined ? `${combined.trim()}\n\n${chunk}` : chunk);

    const missing = missingHdReportSections(combined, opts.required);
    const thin = missing.length === 0 ? thinHdReportSections(combined, opts.required) : [];
    const hitLength = result.finishReason === "length";
    console.warn("[hd-generate] pass done", {
      pass,
      chunkLen: chunk.length,
      finishReason: result.finishReason,
      missing: missing.length,
      thin: thin.length,
    });
    if (!hitLength && missing.length === 0 && thin.length === 0) {
      return dedupeHdSections(combined);
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
  if (missingFinal.length > 0 || thinFinal.length > MAX_THIN_AFTER_PASSES) {
    console.warn("[hd-generate] reject: gate", {
      missing: missingFinal,
      thin: thinFinal,
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
}): Promise<string | null> {
  const who = opts.clientName ?? "клиента";
  const seedUserText =
    `РАСЧЁТНЫЕ ДАННЫЕ:\n${opts.evidence}\n\n` +
    (opts.aboutOther
      ? `Напиши ПОЛНЫЙ премиальный разбор Дизайна Человека о человеке по имени ${who} — для читателя, который хочет глубоко понять этого человека.\n`
      : `Напиши ПОЛНЫЙ премиальный разбор Дизайна Человека для ${who}.\n`) +
    `Это единственная покупка клиента — глубина уровня полной расшифровки конкурентов (все обязательные ## из системного промпта).\n` +
    `Не сокращай. Не пропускай разделы. Цель: 5500–8000 слов, с ### внутри Центров и Каналов.`;

  return completeSectionedReport({
    systemPrompt: opts.systemPrompt,
    seedUserText,
    required: HD_REPORT_REQUIRED_SECTIONS,
    pass0MaxTokens: 12_000,
    continueMaxTokens: 8_000,
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
  });
}
