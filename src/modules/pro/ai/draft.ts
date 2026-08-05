import { generateValidatedAiText } from "@/lib/validated-ai-generation";
import { isProAiEnabled } from "../config";
import type { ProCaseType, ProReportBlock } from "../domain/types";
import { filterPractitionerOutput } from "../safety";
import { proQuery } from "../db";

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
  if (input.type === "natal") {
    return [
      {
        id: "b1",
        title: "Обзор натала",
        body: `Черновик натальной карты для ${input.clientAlias}. AI выключен — заполните вручную или включите PRO_AI_ENABLED.`,
        ai_confidence: 0.35,
      },
    ];
  }
  if (input.type === "matrix") {
    return [
      {
        id: "b1",
        title: "Матрица судьбы",
        body: `Черновик матрицы для ${input.clientAlias}. AI выключен.`,
        ai_confidence: 0.35,
      },
    ];
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
      await logRun(input, result.ok ? null : null, "failed", started);
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

    const blocks = parsed.blocks.map((b, i) => {
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
