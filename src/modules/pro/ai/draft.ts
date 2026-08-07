import { generateValidatedAiText } from "@/lib/validated-ai-generation";
import { isProAiEnabled } from "../config";
import type { ProCaseType, ProReportBlock } from "../domain/types";
import { filterPractitionerOutput } from "../safety";
import { proQuery } from "../db";
import {
  batchSections,
  buildPremiumSystemPrompt,
  sectionsForType,
  stubPremiumBlocks,
} from "./premium-sections";

export type DraftGenerateInput = {
  accountId: string | number;
  caseId: string | number;
  type: ProCaseType;
  question: string | null;
  practitionerContext: string | null;
  clientAlias: string;
  payload: Record<string, unknown>;
  addressForm?: string;
};

function stubBlocks(input: DraftGenerateInput): ProReportBlock[] {
  if (input.type === "natal" || input.type === "matrix" || input.type === "hd") {
    return stubPremiumBlocks(input.type, input.clientAlias);
  }

  const cards = Array.isArray(input.payload.cards)
    ? (input.payload.cards as { name?: string; position?: string }[])
    : [];
  if (input.type === "manual_spread" && cards.length) {
    return cards.map((c, i) => ({
      id: `b${i + 1}`,
      title: c.position || `Позиция ${i + 1}`,
      body: `${c.name || "Карта"}: черновик ожидает включения PRO_AI_ENABLED. Вопрос: ${input.question || "—"}.`,
      position_ref: String(i + 1),
      ai_confidence: 0.4,
    }));
  }
  return [
    {
      id: "b1",
      title: "Разбор",
      body: input.question || "Черновик",
      ai_confidence: 0.3,
    },
  ];
}

function parseDraftJson(text: string): {
  blocks: ProReportBlock[];
  uncertainty: { blockId: string; note: string }[];
} | null {
  try {
    const parsed = JSON.parse(text) as {
      blocks?: ProReportBlock[];
      uncertainty?: { blockId: string; note: string }[];
    };
    if (!Array.isArray(parsed.blocks) || !parsed.blocks.length) return null;
    return {
      blocks: parsed.blocks,
      uncertainty: Array.isArray(parsed.uncertainty) ? parsed.uncertainty : [],
    };
  } catch {
    return null;
  }
}

function sanitizeBlocks(blocks: ProReportBlock[]): ProReportBlock[] {
  return blocks.map((b, i) => {
    const filtered = filterPractitionerOutput(String(b.body || ""));
    return {
      id: b.id || `b${i + 1}`,
      title: String(b.title || `Блок ${i + 1}`),
      body: filtered.text,
      position_ref: b.position_ref ?? null,
      ai_confidence:
        typeof b.ai_confidence === "number" ? b.ai_confidence : 0.55,
    };
  });
}

function chartEvidence(payload: Record<string, unknown>): string {
  const facts = payload.chartFacts;
  if (facts && typeof facts === "object") {
    const ev = (facts as { evidenceText?: unknown }).evidenceText;
    if (typeof ev === "string" && ev.trim()) return ev;
  }
  if (typeof payload.evidenceText === "string" && payload.evidenceText.trim()) {
    return payload.evidenceText;
  }
  return "";
}

async function generatePremiumBatches(
  input: DraftGenerateInput,
  type: "natal" | "matrix" | "hd"
): Promise<{
  blocks: ProReportBlock[];
  uncertainty: { blockId: string; note: string }[];
  model: string | null;
  outcome: "ok" | "filtered" | "failed";
  stub: boolean;
}> {
  const sections = sectionsForType(type)!;
  const batches = batchSections(sections);
  const evidence = chartEvidence(input.payload);
  const allBlocks: ProReportBlock[] = [];
  const allUncertainty: { blockId: string; note: string }[] = [];
  let model: string | null = null;

  if (!evidence) {
    return {
      blocks: stubPremiumBlocks(type, input.clientAlias).map((b) => ({
        ...b,
        body: `${b.body}\n\nНет рассчитанных фактов карты — сохраните дату/место рождения и повторите генерацию.`,
      })),
      uncertainty: [{ blockId: "n1", note: "missing_chart_facts" }],
      model: null,
      outcome: "failed",
      stub: true,
    };
  }

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]!;
    const system = buildPremiumSystemPrompt(type, input.addressForm, batch);
    const userPayload = {
      type,
      client: input.clientAlias,
      question: input.question,
      practitionerContext: input.practitionerContext,
      batchIndex: bi + 1,
      batchCount: batches.length,
      evidenceText: evidence,
      requiredBlockIds: batch.map((s) => s.id),
    };

    const result = await generateValidatedAiText({
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      inputParts: [
        "pro-premium-draft",
        input.caseId,
        type,
        String(bi),
        input.question,
      ],
      modelFamily: "paid",
      jsonObject: true,
      maxTokens: 8000,
      temperature: 0.65,
      timeoutMs: 120_000,
      validate: (text) => {
        const parsed = parseDraftJson(text);
        if (!parsed) {
          return { ok: false as const, code: "invalid_structure" as const, detail: "no_blocks" };
        }
        const ids = new Set(parsed.blocks.map((b) => b.id));
        const missing = batch.filter((s) => !ids.has(s.id));
        if (missing.length > batch.length / 2) {
          return {
            ok: false as const,
            code: "invalid_structure" as const,
            detail: `missing_${missing.map((m) => m.id).join(",")}`,
          };
        }
        return { ok: true as const };
      },
    });

    if (!result.ok || !("content" in result) || !result.content) {
      const stubs = batch.map((s) => ({
        id: s.id,
        title: s.title,
        body: `Не удалось сгенерировать раздел «${s.title}». Заполните вручную или повторите генерацию.`,
        ai_confidence: 0.2,
      }));
      allBlocks.push(...stubs);
      allUncertainty.push({ blockId: batch[0]!.id, note: "ai_batch_failed" });
      continue;
    }

    model = result.provenance?.model ?? model;
    const parsed = parseDraftJson(result.content);
    if (!parsed) {
      allBlocks.push(
        ...batch.map((s) => ({
          id: s.id,
          title: s.title,
          body: `Ошибка разбора ответа AI для «${s.title}».`,
          ai_confidence: 0.2,
        }))
      );
      continue;
    }

    const byId = new Map(sanitizeBlocks(parsed.blocks).map((b) => [b.id, b]));
    for (const s of batch) {
      const block = byId.get(s.id);
      allBlocks.push(
        block || {
          id: s.id,
          title: s.title,
          body: `Раздел «${s.title}» не вернулся из модели — дополните вручную.`,
          ai_confidence: 0.25,
        }
      );
    }
    allUncertainty.push(...parsed.uncertainty);
  }

  const failedHeavy = allUncertainty.some((u) => u.note === "ai_batch_failed");
  return {
    blocks: allBlocks,
    uncertainty: allUncertainty.length
      ? allUncertainty
      : allBlocks
          .filter((b) => (b.ai_confidence ?? 1) < 0.5)
          .map((b) => ({ blockId: b.id, note: "low_confidence" })),
    model,
    outcome: failedHeavy && allBlocks.every((b) => (b.ai_confidence ?? 1) < 0.3)
      ? "failed"
      : "ok",
    stub: false,
  };
}

export async function generateCaseDraft(input: DraftGenerateInput): Promise<{
  blocks: ProReportBlock[];
  uncertaintyMarks: { blockId: string; note: string }[];
  model: string | null;
  outcome: "ok" | "filtered" | "failed";
  stub: boolean;
}> {
  const started = Date.now();
  if (!isProAiEnabled()) {
    const blocks = stubBlocks(input);
    await logRun(input, null, "ok", started);
    return {
      blocks,
      uncertaintyMarks: blocks.map((b) => ({
        blockId: b.id,
        note: "low_confidence_stub",
      })),
      model: null,
      outcome: "ok",
      stub: true,
    };
  }

  if (input.type === "natal" || input.type === "matrix" || input.type === "hd") {
    try {
      const premium = await generatePremiumBatches(input, input.type);
      await logRun(input, premium.model, premium.outcome, started);
      return {
        blocks: premium.blocks,
        uncertaintyMarks: premium.uncertainty,
        model: premium.model,
        outcome: premium.outcome,
        stub: premium.stub,
      };
    } catch {
      await logRun(input, null, "failed", started);
      return {
        blocks: stubBlocks(input),
        uncertaintyMarks: [{ blockId: "b1", note: "ai_exception" }],
        model: null,
        outcome: "failed",
        stub: true,
      };
    }
  }

  const system = `Ты помощник практикующего эзотерика в Zovus Pro.
Пиши на русском, обращение: ${input.addressForm === "ty" ? "на ты" : "на вы"}.
Верни JSON: {"blocks":[{"id":"b1","title":"...","body":"...","ai_confidence":0.0}],"uncertainty":[{"blockId":"b1","note":"..."}]}.
Без медицинских советов и гарантий исхода. Развлекательный тон, бережно.`;

  const userPayload = {
    type: input.type,
    client: input.clientAlias,
    question: input.question,
    practitionerContext: input.practitionerContext,
    payload: input.payload,
  };

  try {
    const result = await generateValidatedAiText({
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      inputParts: ["pro-draft", input.caseId, input.type, input.question],
      modelFamily: "paid",
      jsonObject: true,
      maxTokens: 2500,
      temperature: 0.7,
      validate: (text) => {
        const parsed = parseDraftJson(text);
        if (!parsed) {
          return { ok: false as const, code: "invalid_structure" as const, detail: "no_blocks" };
        }
        return { ok: true as const };
      },
    });

    if (!result.ok || !("content" in result) || !result.content) {
      await logRun(input, null, "failed", started);
      return {
        blocks: stubBlocks(input),
        uncertaintyMarks: [{ blockId: "b1", note: "ai_failed_fallback" }],
        model: result.ok ? result.provenance?.model ?? null : null,
        outcome: "failed",
        stub: true,
      };
    }

    const parsed = parseDraftJson(result.content);
    if (!parsed) {
      await logRun(input, result.provenance?.model ?? null, "failed", started);
      return {
        blocks: stubBlocks(input),
        uncertaintyMarks: [{ blockId: "b1", note: "parse_failed" }],
        model: result.provenance?.model ?? null,
        outcome: "failed",
        stub: true,
      };
    }

    const blocks = sanitizeBlocks(parsed.blocks);
    const uncertainty =
      parsed.uncertainty.length > 0
        ? parsed.uncertainty
        : blocks
            .filter((b) => (b.ai_confidence ?? 1) < 0.5)
            .map((b) => ({ blockId: b.id, note: "low_confidence" }));

    await logRun(input, result.provenance?.model ?? null, "ok", started);
    return {
      blocks,
      uncertaintyMarks: uncertainty,
      model: result.provenance?.model ?? null,
      outcome: "ok",
      stub: false,
    };
  } catch {
    await logRun(input, null, "failed", started);
    return {
      blocks: stubBlocks(input),
      uncertaintyMarks: [{ blockId: "b1", note: "ai_exception" }],
      model: null,
      outcome: "failed",
      stub: true,
    };
  }
}

async function logRun(
  input: DraftGenerateInput,
  model: string | null,
  outcome: "ok" | "filtered" | "failed",
  started: number
): Promise<void> {
  try {
    await proQuery(
      `INSERT INTO pro.assistant_runs
         (account_id, mode, case_id, model, latency_ms, outcome, cost_runes)
       VALUES ($1, 'draft', $2, $3, $4, $5, 0)`,
      [input.accountId, input.caseId, model, Date.now() - started, outcome]
    );
  } catch {
    /* ignore */
  }
}
