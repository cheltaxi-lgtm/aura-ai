import { NextRequest, NextResponse } from "next/server";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import { isHumanDesignEnabled } from "@/lib/settings";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { completeChat, isOpenRouterConfigured, isRejectedLlmOutput } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { resolveUnlimitedAccess } from "@/lib/accounts";
import { getRuneSettings } from "@/lib/rune-settings";
import { isRuneBillingActive } from "@/lib/rune-service";
import {
  BillingService,
  chargeRuneAction,
  InsufficientFundsError,
  type BillingChargeResult,
} from "@/lib/services/billing-service";
import {
  completeCompositeReport,
  createPendingCompositeReport,
  failCompositeReport,
  getHdChartById,
  getHdCompositeReport,
} from "@/lib/services/human-design-service";
import {
  CHANNELS,
  formatHdEvidence,
  TYPE_META,
} from "@/lib/human-design";
import { getUserById } from "@/lib/users";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";

export const maxDuration = 300;

const DISCLAIMER =
  "\n\n---\n*Разбор является символической интерпретацией системы Дизайна Человека и не заменяет профессиональную консультацию.*";

function compositePrompt(clientName: string | null, partnerName: string): string {
  return `Ты — Эвелина, ИИ-наставник Zovus. Пишешь премиальный разбор совместимости двух карт Дизайна Человека (композит) на русском языке.

Тебе даны РАСЧЁТНЫЕ ДАННЫЕ двух карт и список электромагнетических каналов. Правила:
1) Опирайся СТРОГО на эти данные. Нельзя выдумывать ворота, каналы, центры или типы.
2) Структура заголовками Markdown (##): Химия пары, Как вы усиливаете друг друга, Электромагнетические каналы, Зоны притирки, Быт и решения вместе, Практические рекомендации.
3) Тепло, конкретно, без воды. Переводи механику на язык отношений: быт, конфликты, поддержка, близость.
4) Не предсказывай будущее пары и не давай медицинских/юридических советов.
5) Объём — 900–1400 слов.
${clientName ? `Первый человек: «${clientName}» (обращайся «вы» к паре).` : ""}
Второй человек: «${partnerName}».`;
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

  const rateLimited = await enforcePaidRouteRateLimit(userId, "hd_report");
  if (rateLimited) return rateLimited;

  const body = (await request.json().catch(() => ({}))) as {
    baseChartId?: unknown;
    partnerChartId?: unknown;
    aiDataUseAcknowledged?: unknown;
  };
  if (body.aiDataUseAcknowledged !== true) {
    return NextResponse.json(
      { error: "Подтвердите передачу рассчитанных данных карт внешней языковой модели." },
      { status: 400 }
    );
  }
  if (typeof body.baseChartId !== "string" || typeof body.partnerChartId !== "string") {
    return NextResponse.json({ error: "Укажите обе карты." }, { status: 400 });
  }
  if (body.baseChartId === body.partnerChartId) {
    return NextResponse.json({ error: "Выберите две разные карты." }, { status: 400 });
  }

  const base = await getHdChartById(body.baseChartId);
  const partner = await getHdChartById(body.partnerChartId);
  if (!base || !partner || base.userId !== userId || partner.userId !== userId) {
    return NextResponse.json({ error: "Карты не найдены." }, { status: 404 });
  }

  const existing = await getHdCompositeReport(base.id, partner.id, userId);
  if (existing?.status === "done" && existing.reportText) {
    return NextResponse.json({ report: existing, cached: true });
  }
  if (existing?.status === "pending") {
    return NextResponse.json(
      { error: "Разбор уже генерируется. Обновите страницу через минуту.", code: "CLAIM_BUSY" },
      { status: 409 }
    );
  }

  if (!isOpenRouterConfigured()) {
    return NextResponse.json({ error: "Генерация временно недоступна." }, { status: 503 });
  }

  const partnerName =
    partner.subjectKind === "other" && partner.subjectName ? partner.subjectName : "Партнёр";
  const user = await getUserById(userId).catch(() => null);
  const clientName =
    base.subjectKind === "other" && base.subjectName
      ? base.subjectName
      : normalizePersonDisplayName(user?.name) || null;

  // Electromagnetic channels: defined only by the union of both charts.
  const gatesA = new Set(base.chart.activeGates);
  const gatesB = new Set(partner.chart.activeGates);
  const definedA = new Set(base.chart.channels.filter((c) => c.defined).map((c) => c.key));
  const definedB = new Set(partner.chart.channels.filter((c) => c.defined).map((c) => c.key));
  const electro: string[] = [];
  for (const ch of CHANNELS) {
    const key = `${ch.gates[0]}-${ch.gates[1]}`;
    if (
      gatesA.has(ch.gates[0]) !== gatesA.has(ch.gates[1]) &&
      (gatesB.has(ch.gates[0]) || gatesB.has(ch.gates[1])) &&
      (gatesA.has(ch.gates[0]) || gatesA.has(ch.gates[1])) &&
      !definedA.has(key) &&
      !definedB.has(key) &&
      (gatesA.has(ch.gates[0]) || gatesB.has(ch.gates[0])) &&
      (gatesA.has(ch.gates[1]) || gatesB.has(ch.gates[1]))
    ) {
      electro.push(`${key} «${ch.nameRu}»`);
    }
  }

  const evidence =
    `КАРТА 1 (${clientName ?? "первый человек"}), тип: ${TYPE_META[base.chart.type].nameRu}:\n${formatHdEvidence(base.chart)}\n\n` +
    `КАРТА 2 (${partnerName}), тип: ${TYPE_META[partner.chart.type].nameRu}:\n${formatHdEvidence(partner.chart)}\n\n` +
    `ЭЛЕКТРОМАГНЕТИЧЕСКИЕ КАНАЛЫ (возникают только вместе): ${electro.length ? electro.join("; ") : "нет"}`;

  const unlimited = await resolveUnlimitedAccess({ profileUserId: userId });
  const runeSettings = await getRuneSettings();
  const exempt = !isRuneBillingActive(userId, unlimited, runeSettings);

  let charge: BillingChargeResult | undefined;
  let rollbackAttempted = false;
  const rollback = async () => {
    if (!charge || rollbackAttempted) return;
    rollbackAttempted = true;
    await BillingService.rollbackCharge({
      userId,
      cost: charge.spentRunes,
      wasFreeQuestion: charge.wasFreeQuestion,
      transactionId: charge.transactionId,
      actionType: charge.actionType,
      slotReserved: charge.slotReserved,
    });
  };

  try {
    charge = await chargeRuneAction({ userId, action: "HD_REPORT", exempt });

    const pending = await createPendingCompositeReport({
      baseChartId: base.id,
      partnerChartId: partner.id,
      userId,
      transactionId: charge.transactionId ?? null,
    });
    if (!pending) {
      await rollback();
      const again = await getHdCompositeReport(base.id, partner.id, userId);
      if (again?.status === "done" && again.reportText) {
        return NextResponse.json({ report: again, cached: true });
      }
      return NextResponse.json(
        { error: "Разбор уже генерируется. Обновите страницу через минуту.", code: "CLAIM_BUSY" },
        { status: 409 }
      );
    }

    const answer = await completeChat({
      messages: [
        { role: "system", content: await wrapSystemPrompt(compositePrompt(clientName, partnerName)) },
        { role: "user", content: evidence },
      ],
      maxTokens: 4000,
      temperature: 0.75,
      isPaid: true,
      timeoutMs: 240_000,
    });

    if (!answer || isRejectedLlmOutput(answer)) {
      await failCompositeReport(pending.id, "empty_or_rejected");
      await rollback();
      return NextResponse.json(
        { error: "Модель не смогла подготовить разбор. Оплата возвращена.", refunded: true },
        { status: 502 }
      );
    }

    const text = answer.trim() + DISCLAIMER;
    await completeCompositeReport(pending.id, text, "openrouter");
    const done = await getHdCompositeReport(base.id, partner.id, userId);
    return NextResponse.json({ report: done, cached: false, runeBalance: charge.newBalance });
  } catch (error) {
    await rollback().catch(() => {
      console.warn("[human-design] composite rollback failed");
    });
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
    console.warn("[human-design] composite report failed");
    return NextResponse.json(
      { error: "Ошибка генерации разбора.", refunded: rollbackAttempted },
      { status: 502 }
    );
  }
}
