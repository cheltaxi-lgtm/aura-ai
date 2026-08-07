import { completeChatDetailed, type ChatMessage } from "@/lib/llm";
import { getHdModel } from "@/lib/ai-model";
import type { HdChart } from "@/lib/human-design/types";
import { formatHdEvidence, sanitizeHdReportText } from "@/lib/human-design/prompt";
import { buildHdLockedContract, type HdLockedContract } from "./contract";
import {
  HD_PIPELINE_BANS,
  HD_PIPELINE_BATCHES,
  type HdPipelineSectionTitle,
} from "./sections";
import {
  estimateCostRubFromUsage,
  type HdTokenUsage,
} from "./cost";
import {
  validateHdReportText,
  type HdQualityFinding,
  type HdQualityResult,
} from "@/lib/hd-report-quality/validator";

export type HdSectionalGenerateOpts = {
  chart: HdChart;
  clientName: string | null;
  aboutOther?: boolean;
  focusQuestion?: string | null;
  extraSystem?: string | null;
  maxSectionRetries?: number;
  /** Regenerate only these ## titles (keeps other sections from priorText). */
  onlyTitles?: string[] | null;
  priorText?: string | null;
};

export type HdSectionalGenerateResult = {
  text: string | null;
  contract: HdLockedContract;
  quality: HdQualityResult;
  llmCalls: number;
  needsRegeneration: boolean;
  usage: HdTokenUsage;
  costRub: number;
  modelId: string;
  durationMs: number;
};

type SectionDraft = { title: string; body: string; thesis: string };

function thesisOf(body: string): string {
  const plain = body.replace(/\s+/g, " ").trim();
  if (plain.length <= 280) return plain;
  return `${plain.slice(0, 277).trim()}…`;
}

function buildSystemPrompt(
  contract: HdLockedContract,
  clientName: string | null,
  aboutOther: boolean,
  extraSystem?: string | null
): string {
  const address = aboutOther
    ? `Пиши о человеке по имени «${clientName ?? "этот человек"}» в третьем лице для читателя.`
    : `Обращайся к читателю на «Вы»${clientName ? `, по имени «${clientName}»` : ""}.`;
  return [
    "Ты — Эвелина, ИИ-наставник Zovus. Пишешь разделы премиальной расшифровки Дизайна Человека.",
    address,
    "",
    contract.contractBlock,
    "",
    HD_PIPELINE_BANS,
    "",
    "Формат: для КАЖДОГО запрошенного раздела — строка `## ТочныйЗаголовок`, затем текст.",
    "Вступление (если запрошено) — без ##, просто проза в начале ответа.",
    "Структура каждого раздела: механика → жизнь → 1–2 бытовых примера → что делать.",
    "Не повторяй тезисы из уже готовых разделов.",
    extraSystem?.trim() || "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function llmOnce(
  messages: ChatMessage[],
  maxTokens: number,
  modelOverride: string
): Promise<{ text: string; calls: number; usage: HdTokenUsage }> {
  const emptyUsage = { promptTokens: 0, completionTokens: 0 };
  // Always pass hdModel — isPaid alone resolves paidModel (DeepSeek), which
  // ignores the admin HD picker and fails the sectional quality gate.
  let result = await completeChatDetailed({
    messages,
    maxTokens,
    temperature: 0.55,
    modelOverride,
    timeoutMs: 180_000,
    skipTemperatureRetry: true,
    skipDegenerateCheck: true,
  });
  let text = (result.text || "").trim();
  let calls = 1;
  let usage: HdTokenUsage = {
    promptTokens: result.usage?.promptTokens ?? 0,
    completionTokens: result.usage?.completionTokens ?? 0,
  };
  if (!text) {
    result = await completeChatDetailed({
      messages,
      maxTokens,
      temperature: 0.4,
      modelOverride,
      timeoutMs: 180_000,
      skipTemperatureRetry: true,
      skipDegenerateCheck: true,
    });
    text = (result.text || "").trim();
    calls = 2;
    usage = {
      promptTokens: usage.promptTokens + (result.usage?.promptTokens ?? 0),
      completionTokens:
        usage.completionTokens + (result.usage?.completionTokens ?? 0),
    };
  }
  if (!text) return { text: "", calls, usage: usage.promptTokens ? usage : emptyUsage };
  return { text, calls, usage };
}

function normalizeTitleKey(raw: string): string {
  return raw
    .trim()
    .replace(/[.!?…:]+$/u, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const KNOWN_TITLE_KEYS = new Set(
  HD_PIPELINE_BATCHES.flatMap((b) => b.titles).map((t) => normalizeTitleKey(t))
);

/** Model wraps whole batches in ``` markdown fences / leaves escape artifacts. */
function stripWrapperJunk(raw: string): string {
  let t = raw.replace(/\r\n/g, "\n").trim();
  t = t.replace(/^\s*```[a-z]*\s*\n/i, "").replace(/\n\s*```\s*$/i, "");
  t = t.replace(/^```[a-z]*\s*$/gim, "");
  t = t.replace(/^\s*\\?[*_]+\s*$/gm, ""); // dangling emphasis-only junk lines
  return t.trim();
}

/** Editor invents headings («## Светлана, ваша карта…») — drop unknown ## lines. */
function demoteUnknownHeadings(text: string): string {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const m = /^##(?!#)\s+(.*)$/.exec(line.trim());
    if (m && !KNOWN_TITLE_KEYS.has(normalizeTitleKey(m[1]!))) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Short meta preamble before the first ## («Вот полный разбор… в markdown:»). */
function dropMetaPreamble(text: string): string {
  const idx = text.search(/^##(?!#)\s+/m);
  if (idx <= 0) return text;
  const pre = text.slice(0, idx).trim();
  if (pre.length >= 200) return text; // real intro section
  if (/вот|markdown|ниже|продолж|^#+\s/i.test(pre)) return text.slice(idx).trim();
  return text;
}

export function sanitizeHdGeneratedText(text: string): string {
  return demoteUnknownHeadings(
    dropMetaPreamble(sanitizeHdReportText(stripWrapperJunk(text)))
  );
}

function parseBatchOutput(
  titles: readonly string[],
  raw: string
): SectionDraft[] {
  const cleaned = stripWrapperJunk(raw);
  const drafts: SectionDraft[] = [];
  const hasIntro = titles.includes("Вступление");
  const chunks = cleaned.split(/^##(?!#)\s+/m);

  if (hasIntro && chunks[0]?.trim()) {
    const introBody = chunks[0].trim().replace(/^#+\s*.+$/m, "").trim();
    if (introBody.length > 40) {
      drafts.push({
        title: "Вступление",
        body: introBody,
        thesis: thesisOf(introBody),
      });
    }
  }

  const titleSet = new Map(
    titles.map((t) => [normalizeTitleKey(t), t] as const)
  );
  for (let i = 0; i < chunks.length; i++) {
    if (hasIntro && i === 0) continue;
    const chunk = chunks[i]?.trim();
    if (!chunk) continue;
    const nl = chunk.indexOf("\n");
    const rawTitle = (nl === -1 ? chunk : chunk.slice(0, nl)).trim();
    const body = (nl === -1 ? "" : chunk.slice(nl + 1)).trim();
    const canon = titleSet.get(normalizeTitleKey(rawTitle));
    if (!canon || canon === "Вступление") continue;
    drafts.push({ title: canon, body, thesis: thesisOf(body) });
  }

  for (const t of titles) {
    if (!drafts.some((d) => d.title === t)) {
      drafts.push({ title: t, body: "", thesis: "" });
    }
  }
  return titles.map(
    (t) => drafts.find((d) => d.title === t) ?? { title: t, body: "", thesis: "" }
  );
}

function glue(sections: SectionDraft[]): string {
  return sections
    .map((s) => {
      if (s.title === "Вступление") return s.body.trim();
      return `## ${s.title}\n${s.body.trim()}`.trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

function parsePriorText(text: string): SectionDraft[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  const chunks = cleaned.split(/^##(?!#)\s+/m);
  const out: SectionDraft[] = [];
  chunks.forEach((chunk, index) => {
    const trimmed = chunk.trim();
    if (!trimmed) return;
    if (index === 0 && chunks.length > 1) {
      out.push({
        title: "Вступление",
        body: trimmed,
        thesis: thesisOf(trimmed),
      });
      return;
    }
    const nl = trimmed.indexOf("\n");
    const title = (nl === -1 ? trimmed : trimmed.slice(0, nl)).trim();
    const body = (nl === -1 ? "" : trimmed.slice(nl + 1)).trim();
    out.push({ title, body, thesis: thesisOf(body) });
  });
  return out;
}

async function editorPass(
  fullText: string,
  contract: HdLockedContract,
  modelOverride: string
): Promise<{ text: string; calls: number; usage: HdTokenUsage }> {
  const system = [
    "Ты редактор премиальных отчётов Дизайна Человека.",
    "Удали мета-фразы, повторы, служебные пометки, почини опечатки и экранирование markdown.",
    "ЗАПРЕЩЕНО добавлять новый смысловой контент.",
    "Сохрани все ## заголовки и смысл.",
    `Канон: Тип=${contract.typeRu}; Угол креста=${contract.crossAngleRu}; Крест=«${contract.crossNameRu}».`,
    HD_PIPELINE_BANS,
  ].join("\n");
  const { text, calls, usage } = await llmOnce(
    [
      { role: "system", content: system },
      {
        role: "user",
        content: `Отредактируй отчёт. Верни полный markdown.\n\n${fullText}`,
      },
    ],
    12_000,
    modelOverride
  );
  return { text: text || fullText, calls, usage };
}

function sectionTitlesHitByFindings(
  sections: SectionDraft[],
  findings: HdQualityFinding[]
): Set<string> {
  const hit = new Set<string>();
  for (const f of findings) {
    if (f.rule === "V2" && f.detail.startsWith("duplicate_title:")) {
      const title = f.detail.slice("duplicate_title:".length).split("×")[0];
      if (title) hit.add(title);
    }
    if (f.rule === "V6" && f.detail.startsWith("section_too_short:")) {
      const title = f.detail.slice("section_too_short:".length).split(":")[0];
      if (title) hit.add(title.toLowerCase());
    }
    if (f.rule === "V6" && f.detail === "missing_focus_answer_section") {
      hit.add("ответ на ваш запрос");
    }
  }
  for (const s of sections) {
    const local = validateHdReportText(
      s.title === "Вступление" ? s.body : `## ${s.title}\n${s.body}`,
      { requireFocusAnswer: false, engineTypeRu: null }
    );
    if (
      local.findings.some((x) =>
        ["V1", "V3", "V5", "V9", "V10", "V11", "V12"].includes(x.rule)
      )
    ) {
      hit.add(s.title.toLowerCase());
    }
  }
  return hit;
}

async function generateBatch(opts: {
  system: string;
  evidence: string;
  contract: HdLockedContract;
  titles: readonly HdPipelineSectionTitle[];
  focus: string;
  prior: SectionDraft[];
  maxTokens: number;
  modelOverride: string;
}): Promise<{ drafts: SectionDraft[]; calls: number; usage: HdTokenUsage }> {
  const priorBlock =
    opts.prior.length === 0
      ? "Ранее сгенерированных разделов нет."
      : opts.prior
          .map((p, i) => `${i + 1}. «${p.title}»: ${p.thesis}`)
          .join("\n");

  const headingList = opts.titles
    .map((t) => (t === "Вступление" ? "Вступление (без ##)" : `## ${t}`))
    .join("\n");

  const sleepHint = opts.titles.includes("Сон и восстановление")
    ? "\n«Сон и восстановление»: только энергия через стратегию/центры — БЕЗ часов сна.\n"
    : "";
  const answerHint = opts.titles.includes("Ответ на ваш запрос")
    ? `\n«Ответ на ваш запрос»: ответь на фокус «${opts.focus || "общий разбор"}» через механику карты, без прогнозов и сроков.\n`
    : "";

  const user = [
    `РАСЧЁТНЫЕ ДАННЫЕ:\n${opts.evidence}`,
    "",
    `УЖЕ ГОТОВЫЕ РАЗДЕЛЫ (не повторяй):\n${priorBlock}`,
    "",
    opts.focus
      ? `ФОКУС ЗАПРОСА: «${opts.focus}» — связывай через механику, без прогноза событий.`
      : "",
    sleepHint,
    answerHint,
    `Напиши ТОЛЬКО эти разделы с точными заголовками:\n${headingList}`,
    `Канон: Тип=${opts.contract.typeRu}; Стратегия=${opts.contract.strategyRu}; Авторитет=${opts.contract.authorityRu}; Угол=${opts.contract.crossAngleRu}; Крест=«${opts.contract.crossNameRu}»; Висячие=${opts.contract.hangingGatesRu}.`,
  ]
    .filter(Boolean)
    .join("\n");

  const { text, calls, usage } = await llmOnce(
    [
      { role: "system", content: opts.system },
      { role: "user", content: user },
    ],
    opts.maxTokens,
    opts.modelOverride
  );
  return { drafts: parseBatchOutput(opts.titles, text), calls, usage };
}

/**
 * Sectional HD report with batched related sections + editor + quality gate.
 */
export async function generateHdReportSectional(
  opts: HdSectionalGenerateOpts
): Promise<HdSectionalGenerateResult> {
  const started = Date.now();
  const contract = buildHdLockedContract(opts.chart);
  const evidence = formatHdEvidence(opts.chart);
  const aboutOther = Boolean(opts.aboutOther);
  const system = buildSystemPrompt(
    contract,
    opts.clientName,
    aboutOther,
    opts.extraSystem
  );
  const focus = opts.focusQuestion?.trim() || "";
  const maxRetries = Math.max(0, opts.maxSectionRetries ?? 2);
  const modelId = await getHdModel();

  let llmCalls = 0;
  const usageTotal: HdTokenUsage = { promptTokens: 0, completionTokens: 0 };
  const addUsage = (u: HdTokenUsage) => {
    usageTotal.promptTokens += u.promptTokens;
    usageTotal.completionTokens += u.completionTokens;
  };

  const only = (opts.onlyTitles || [])
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const priorMap = new Map<string, SectionDraft>();
  if (opts.priorText) {
    for (const s of parsePriorText(opts.priorText)) {
      priorMap.set(s.title.toLowerCase(), s);
    }
  }

  const sections: SectionDraft[] = [];

  for (const batch of HD_PIPELINE_BATCHES) {
    const titles = batch.titles.filter((t) => {
      if (!only.length) return true;
      return only.includes(t.toLowerCase());
    });
    if (!titles.length) {
      // Keep prior sections for skipped batches
      for (const t of batch.titles) {
        const prev = priorMap.get(t.toLowerCase());
        if (prev) sections.push(prev);
      }
      continue;
    }

    // For partial regen, seed prior from already kept sections + priorMap
    const prior = [
      ...sections,
      ...[...priorMap.values()].filter(
        (p) => !sections.some((s) => s.title === p.title)
      ),
    ];

    let { drafts, calls, usage } = await generateBatch({
      system,
      evidence,
      contract,
      titles: titles as readonly HdPipelineSectionTitle[],
      focus,
      prior,
      maxTokens: batch.maxTokens,
      modelOverride: modelId,
    });
    llmCalls += calls;
    addUsage(usage);

    // Retry thin titles once inside the batch
    const thin = drafts.filter((d) => d.body.length < 40);
    if (thin.length) {
      const again = await generateBatch({
        system,
        evidence,
        contract,
        titles: thin.map((t) => t.title) as readonly HdPipelineSectionTitle[],
        focus,
        prior: [...sections, ...drafts.filter((d) => d.body.length >= 40)],
        maxTokens: batch.maxTokens,
        modelOverride: modelId,
      });
      llmCalls += again.calls;
      addUsage(again.usage);
      drafts = drafts.map((d) => {
        const replacement = again.drafts.find((x) => x.title === d.title);
        if (replacement && replacement.body.length > d.body.length) return replacement;
        return d;
      });
    }

    // Merge: for full run push all batch titles in order; for partial keep others from prior
    for (const t of batch.titles) {
      const draft = drafts.find((d) => d.title === t);
      if (draft) sections.push(draft);
      else {
        const prev = priorMap.get(t.toLowerCase());
        if (prev) sections.push(prev);
      }
    }
  }

  // Ensure every required title exists before the editor can drop stubs.
  for (const t of HD_PIPELINE_BATCHES.flatMap((b) => b.titles)) {
    if (!sections.some((s) => s.title === t)) {
      sections.push({ title: t, body: "", thesis: "" });
    }
  }

  // Fill missing/thin batches before editor (editor must not invent sections).
  for (const batch of HD_PIPELINE_BATCHES) {
    const thinTitles = batch.titles.filter((t) => {
      const s = sections.find((x) => x.title === t);
      return !s || s.body.trim().length < 80;
    });
    if (!thinTitles.length) continue;
    const prior = sections.filter((s) => !thinTitles.includes(s.title as HdPipelineSectionTitle));
    const { drafts, calls, usage } = await generateBatch({
      system,
      evidence,
      contract,
      titles: thinTitles as readonly HdPipelineSectionTitle[],
      focus,
      prior,
      maxTokens: batch.maxTokens,
      modelOverride: modelId,
    });
    llmCalls += calls;
    addUsage(usage);
    for (const d of drafts) {
      const idx = sections.findIndex((s) => s.title === d.title);
      if (idx >= 0) {
        if (d.body.trim().length > (sections[idx]?.body.trim().length ?? 0)) {
          sections[idx] = d;
        }
      } else {
        sections.push(d);
      }
    }
  }

  // Stable order
  const ordered: SectionDraft[] = [];
  for (const t of HD_PIPELINE_BATCHES.flatMap((b) => b.titles)) {
    const s = sections.find((x) => x.title === t);
    if (s) ordered.push(s);
  }
  sections.length = 0;
  sections.push(...ordered);

  let combined = glue(sections);
  const edited = await editorPass(combined, contract, modelId);
  llmCalls += edited.calls;
  addUsage(edited.usage);
  // Prefer edited text only if it keeps all required ## titles.
  const editedClean = sanitizeHdGeneratedText(edited.text);
  const missingAfterEdit = HD_PIPELINE_BATCHES.flatMap((b) => b.titles).filter(
    (t) =>
      t !== "Вступление" &&
      !editedClean.toLowerCase().includes(`## ${t}`.toLowerCase())
  );
  combined =
    missingAfterEdit.length === 0
      ? editedClean
      : sanitizeHdGeneratedText(combined);

  let quality = validateHdReportText(combined, {
    engineTypeRu: contract.typeRu,
    motorCount: contract.motorCentersDefinedRu.length,
    contract,
    requireFocusAnswer: true,
  });

  let round = 0;
  while (!quality.ok && round < maxRetries) {
    round++;
    const bad = sectionTitlesHitByFindings(sections, quality.findings);
    if (bad.size === 0) break;
    for (const batch of HD_PIPELINE_BATCHES) {
      const titles = batch.titles.filter((t) => bad.has(t.toLowerCase()));
      if (!titles.length) continue;
      const prior = sections.filter((s) => !titles.includes(s.title as HdPipelineSectionTitle));
      const { drafts, calls, usage } = await generateBatch({
        system,
        evidence,
        contract,
        titles: titles as readonly HdPipelineSectionTitle[],
        focus,
        prior,
        maxTokens: batch.maxTokens,
        modelOverride: modelId,
      });
      llmCalls += calls;
      addUsage(usage);
      for (const d of drafts) {
        const idx = sections.findIndex((s) => s.title === d.title);
        if (idx >= 0) sections[idx] = d;
      }
    }
    combined = glue(sections);
    const reEdit = await editorPass(combined, contract, modelId);
    llmCalls += reEdit.calls;
    addUsage(reEdit.usage);
    const reEditClean = sanitizeHdGeneratedText(reEdit.text);
    const reEditMissing = HD_PIPELINE_BATCHES.flatMap((b) => b.titles).filter(
      (t) =>
        t !== "Вступление" &&
        !reEditClean.toLowerCase().includes(`## ${t}`.toLowerCase())
    );
    combined = reEditMissing.length === 0 ? reEditClean : sanitizeHdGeneratedText(combined);
    quality = validateHdReportText(combined, {
      engineTypeRu: contract.typeRu,
      motorCount: contract.motorCentersDefinedRu.length,
      contract,
      requireFocusAnswer: true,
    });
  }

  const costRub = estimateCostRubFromUsage(usageTotal, modelId);
  const durationMs = Date.now() - started;

  return {
    text: combined,
    contract,
    quality,
    llmCalls,
    needsRegeneration: !quality.ok,
    usage: usageTotal,
    costRub,
    modelId,
    durationMs,
  };
}
