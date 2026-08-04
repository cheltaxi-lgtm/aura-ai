import { NextRequest, NextResponse } from "next/server";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import { isHumanDesignEnabled } from "@/lib/settings";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { completeChat, isOpenRouterConfigured, isRejectedLlmOutput, type ChatMessage } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { resolveUnlimitedAccess } from "@/lib/accounts";
import { getRuneSettings } from "@/lib/rune-settings";
import { isRuneBillingActive } from "@/lib/rune-service";
import {
  chargeRuneAction,
  ensureSufficientRunes,
  InsufficientFundsError,
} from "@/lib/services/billing-service";
import { withTransaction } from "@/lib/db";
import {
  getHdCenterInsight,
  getHdChartById,
  HD_UUID_RE,
  insertHdCenterInsight,
} from "@/lib/services/human-design-service";
import {
  buildHdAskSystemPrompt,
  formatHdEvidence,
  CENTER_NAMES_RU,
  type HdCenterKey,
} from "@/lib/human-design";
import { getUserById } from "@/lib/users";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";

export const maxDuration = 120;

const VALID_CENTERS = new Set<string>([
  "head", "ajna", "throat", "g", "heart", "sacral", "solar", "spleen", "root",
]);

/** Aborts the charge transaction when a concurrent purchase already stored the insight. */
class HdInsightExistsError extends Error {
  constructor() {
    super("hd_insight_exists");
    this.name = "HdInsightExistsError";
  }
}

export async function POST(request: NextRequest) {
  if (!(await isHumanDesignEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const resolved = await resolveProfileUserContext();
  if (!resolved.ok) {
    return profileAuthFailureResponse(resolved.reason);
  }
  const userId = resolved.profileUserId;

  const rateLimited = await enforcePaidRouteRateLimit(userId, "hd_ask");
  if (rateLimited) return rateLimited;

  const body = (await request.json().catch(() => ({}))) as {
    chartId?: unknown;
    center?: unknown;
  };
  if (
    typeof body.chartId !== "string" ||
    !HD_UUID_RE.test(body.chartId) ||
    typeof body.center !== "string" ||
    !VALID_CENTERS.has(body.center)
  ) {
    return NextResponse.json({ error: "Укажите карту и центр." }, { status: 400 });
  }

  const chart = await getHdChartById(body.chartId);
  // IDOR guard: insights are paid and chart-bound — owner only.
  if (!chart || chart.userId !== userId) {
    return NextResponse.json({ error: "Карта не найдена." }, { status: 404 });
  }

  const centerKey = body.center as HdCenterKey;

  // Idempotency: a previously purchased insight is served from the store —
  // repeat clicks never charge twice, and a crash after the charge can never
  // lose the paid text.
  const cached = await getHdCenterInsight(chart.id, userId, centerKey);
  if (cached) {
    return NextResponse.json({ answer: cached.insightText, cached: true });
  }

  if (!isOpenRouterConfigured()) {
    return NextResponse.json({ error: "Генерация временно недоступна." }, { status: 503 });
  }

  const center = centerKey;
  const defined = chart.chart.definedCenters.includes(center);
  const centerName = CENTER_NAMES_RU[center];

  const user = await getUserById(userId).catch(() => null);
  const clientName =
    chart.subjectKind === "other" && chart.subjectName
      ? normalizePersonDisplayName(chart.subjectName) || null
      : normalizePersonDisplayName(user?.name) || null;
  const evidence = formatHdEvidence(chart.chart);
  const systemPrompt = await wrapSystemPrompt(buildHdAskSystemPrompt(clientName));

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "system", content: `РАСЧЁТНЫЕ ДАННЫЕ:\n${evidence}` },
    {
      role: "user",
      content:
        `Дай глубокий, но компактный разбор центра «${centerName}» в этой карте. ` +
        `Центр ${defined ? "ОПРЕДЕЛЁН" : "ОТКРЫТ"}. ` +
        "Объясни: что это значит в жизни человека, сильные стороны, теневая сторона и один практичный совет. " +
        "До 180 слов, без заголовков, живым языком.",
    },
  ];

  const unlimited = await resolveUnlimitedAccess({ profileUserId: userId });
  const runeSettings = await getRuneSettings();
  const exempt = !isRuneBillingActive(userId, unlimited, runeSettings);

  try {
    // Generate-first: a crash during the LLM call can never lose the user's
    // runes. Balance is pre-checked so broke users don't burn model tokens;
    // the authoritative charge happens only after a valid answer exists.
    await ensureSufficientRunes({ userId, action: "HD_ASK", exempt });

    const answer = await completeChat({
      messages,
      maxTokens: 700,
      temperature: 0.7,
      isPaid: true,
      timeoutMs: 90_000,
    });

    if (!answer || isRejectedLlmOutput(answer)) {
      return NextResponse.json(
        { error: "Модель не смогла ответить. Оплата не списывалась." },
        { status: 502 }
      );
    }

    const text = answer.trim();
    // Charge + persist atomically: a paid insight is stored before the
    // response leaves, so a lost HTTP response never loses the purchase.
    const { charge, insight } = await withTransaction(async (client) => {
      const c = await chargeRuneAction({ userId, action: "HD_ASK", exempt, client });
      const row = await insertHdCenterInsight(
        {
          chartId: chart.id,
          userId,
          center,
          insightText: text,
          transactionId: c.transactionId ?? null,
        },
        client
      );
      if (!row) {
        // Concurrent purchase stored the insight first — roll this charge
        // back by aborting the transaction and serve the existing row.
        throw new HdInsightExistsError();
      }
      return { charge: c, insight: row };
    });

    return NextResponse.json({ answer: insight.insightText, runeBalance: charge.newBalance });
  } catch (error) {
    if (error instanceof HdInsightExistsError) {
      const existing = await getHdCenterInsight(chart.id, userId, center);
      if (existing) {
        return NextResponse.json({ answer: existing.insightText, cached: true });
      }
    }
    if (error instanceof InsufficientFundsError) {
      return NextResponse.json(
        {
          error: "insufficient_runes",
          message: "Недостаточно рун для этого действия.",
          balance: error.balance,
          required: error.required,
          cost: error.required,
        },
        { status: 402 }
      );
    }
    console.warn("[human-design] center insight failed");
    return NextResponse.json(
      { error: "Ошибка генерации ответа. Оплата не списывалась." },
      { status: 502 }
    );
  }
}
