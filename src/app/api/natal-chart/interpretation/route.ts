import { NextResponse } from "next/server";
import { requireProfileUserId } from "@/lib/require-auth";
import { isNatalChartEnabled } from "@/lib/settings";
import { buildNatalPromptBlock } from "@/lib/natal/format-prompt";
import { getOrComputeNatalChart, saveNatalInterpretation } from "@/lib/services/natal-chart-service";
import { BillingService, InsufficientFundsError } from "@/lib/services/billing-service";
import { generateReading } from "@/lib/chat-prompts";
import { getUserById } from "@/lib/users";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";

export async function POST() {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const ctx = await requireProfileUserId();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(
    ctx.profileUserId,
    "natal_chart_interpretation"
  );
  if (rateLimited) return rateLimited;

  const chart = await getOrComputeNatalChart(ctx.profileUserId);
  if (!chart?.western && !chart?.vedic) {
    return NextResponse.json(
      { error: "Сначала заполните дату и город рождения в профиле." },
      { status: 400 }
    );
  }

  const stored = chart as typeof chart & { interpretation?: string };
  if (stored.interpretation?.trim()) {
    return NextResponse.json({ interpretation: stored.interpretation, cached: true });
  }

  let charge;
  try {
    charge = await BillingService.chargeRuneAction({
      userId: ctx.profileUserId,
      action: "NATAL_READING",
    });
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      return NextResponse.json(
        { error: "insufficient", balance: err.balance, cost: err.required },
        { status: 402 }
      );
    }
    throw err;
  }

  const rollback = async () => {
    await BillingService.rollbackCharge({
      userId: ctx.profileUserId,
      cost: charge.spentRunes,
      wasFreeQuestion: charge.wasFreeQuestion,
      actionType: charge.actionType,
      slotReserved: charge.slotReserved,
    });
  };

  const user = await getUserById(ctx.profileUserId);
  const natalBlock = buildNatalPromptBlock(chart);
  const systemPrompt = `Ты — Shri Raj, мастер астрологии и таро Zovus. Составь глубокую, но понятную натальную трактовку на русском языке.

Правила:
- Опирайся ТОЛЬКО на блок расчётов ниже. Не выдумывай градусы, дома и положения.
- 5–7 абзацев связной прозой, без markdown и списков.
- Сочетай западную и ведическую линии, если обе есть.
- Заверши практичным советом на ближайшие месяцы.
- Если время рождения неизвестно — явно оговори ограничения по асценденту и домам.

${natalBlock}`;

  try {
    const generated = await generateReading(systemPrompt, {
      userName: user?.name ?? "друг",
      tarotCards: [],
      isPaid: true,
      characterId: "shri-raj",
      userMessage: "Дай полную натальную трактовку по моим данным.",
    });

    const interpretation = generated.text?.trim();
    if (!interpretation) {
      await rollback();
      return NextResponse.json({ error: "Не удалось сгенерировать трактовку." }, { status: 502 });
    }

    await saveNatalInterpretation(ctx.profileUserId, interpretation);

    return NextResponse.json({
      interpretation,
      runeBalance: charge.newBalance,
    });
  } catch (err) {
    await rollback();
    console.warn("[natal-chart] interpretation failed:", err);
    return NextResponse.json({ error: "Ошибка генерации трактовки." }, { status: 502 });
  }
}
