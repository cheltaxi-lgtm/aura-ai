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
import { withTransaction } from "@/lib/db";
import {
  attachCompositeReportTransaction,
  completeCompositeReport,
  createPendingCompositeReport,
  deleteCompositeReportRow,
  failCompositeReport,
  getHdChartById,
  getHdCompositeReport,
  hasRuneRefundForTransaction,
  HD_UUID_RE,
  isStalePendingComposite,
  lockStalePendingCompositeForResume,
  markCompositeReportChargeRefunded,
  releaseStalePendingCompositeLock,
  toPublicHdCompositeReport,
  type HdCompositeReportRow,
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
  if (
    typeof body.baseChartId !== "string" ||
    typeof body.partnerChartId !== "string" ||
    !HD_UUID_RE.test(body.baseChartId) ||
    !HD_UUID_RE.test(body.partnerChartId)
  ) {
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

  let existing = await getHdCompositeReport(base.id, partner.id, userId);
  if (existing?.status === "done" && existing.reportText) {
    return NextResponse.json({ report: toPublicHdCompositeReport(existing), cached: true });
  }
  if (existing?.status === "pending" && !isStalePendingComposite(existing)) {
    return NextResponse.json(
      { error: "Разбор уже генерируется. Обновите страницу через минуту.", code: "CLAIM_BUSY" },
      { status: 409 }
    );
  }
  // Stale pending with a recorded charge → crashed after payment: resume
  // generation on the same row without charging twice.
  let resumePaidPending =
    existing?.status === "pending" &&
    isStalePendingComposite(existing) &&
    Boolean(existing.transactionId);

  if (resumePaidPending && existing?.transactionId) {
    // Barrier against refunded orphans: if the charge behind this row was
    // already returned (rollback raced a crash), resuming would be a FREE
    // generation. Drop the row and fall into the normal paid flow.
    const alreadyRefunded = await hasRuneRefundForTransaction(existing.transactionId).catch(() => false);
    if (alreadyRefunded) {
      await deleteCompositeReportRow(existing.id).catch(() => undefined);
      existing = null;
      resumePaidPending = false;
    }
  }

  if (!isOpenRouterConfigured()) {
    return NextResponse.json({ error: "Генерация временно недоступна." }, { status: 503 });
  }

  // Normalize at the prompt boundary too — rows stored before the storage-side
  // normalization may still carry raw input (prompt-injection surface).
  const partnerName =
    partner.subjectKind === "other" && partner.subjectName
      ? normalizePersonDisplayName(partner.subjectName) || "Партнёр"
      : "Партнёр";
  const user = await getUserById(userId).catch(() => null);
  const clientName =
    base.subjectKind === "other" && base.subjectName
      ? normalizePersonDisplayName(base.subjectName) || null
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
  let refundLanded = false;
  let completed = false;
  let pending: HdCompositeReportRow | null = null;
  const rollback = async () => {
    if (!charge || rollbackAttempted) return;
    rollbackAttempted = true;
    const res = await BillingService.rollbackChargeEx({
      userId,
      cost: charge.spentRunes,
      wasFreeQuestion: charge.wasFreeQuestion,
      transactionId: charge.transactionId,
      actionType: charge.actionType,
      slotReserved: charge.slotReserved,
    });
    refundLanded = res.refunded;
    if (res.refunded && pending) {
      // Money went back → the pending row must NEVER be resumable (a resumable
      // row with a refunded charge is a free generation 10 minutes later).
      await markCompositeReportChargeRefunded(pending.id);
    }
  };

  try {
    if (resumePaidPending && existing) {
      // CAS-lock the stale row: concurrent resumes see a fresh pending → 409.
      const locked = await lockStalePendingCompositeForResume(existing.id);
      if (!locked) {
        return NextResponse.json(
          { error: "Разбор уже генерируется. Обновите страницу через минуту.", code: "CLAIM_BUSY" },
          { status: 409 }
        );
      }
      pending = existing;
    } else {
      // error / unpaid stale pending → start over (its charge was rolled back).
      if (existing) await deleteCompositeReportRow(existing.id);

      // Atomic: pending row + charge + transaction link commit or roll back
      // together — a crash can leave neither a paid orphan nor an unpaid charge.
      const created = await withTransaction(async (client) => {
        const row = await createPendingCompositeReport(
          {
            baseChartId: base.id,
            partnerChartId: partner.id,
            userId,
            transactionId: null,
          },
          client
        );
        if (!row) return null;
        const c = await chargeRuneAction({ userId, action: "HD_REPORT", exempt, client });
        await attachCompositeReportTransaction(row.id, c.transactionId ?? null, client);
        return { row, charge: c };
      });
      if (!created) {
        const again = await getHdCompositeReport(base.id, partner.id, userId);
        if (again?.status === "done" && again.reportText) {
          return NextResponse.json({ report: toPublicHdCompositeReport(again), cached: true });
        }
        return NextResponse.json(
          { error: "Разбор уже генерируется. Обновите страницу через минуту.", code: "CLAIM_BUSY" },
          { status: 409 }
        );
      }
      pending = created.row;
      charge = created.charge;
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
      await rollback();
      if (resumePaidPending) {
        // Keep the paid pending row: the next attempt resumes it for free.
        // Release the CAS-lock age reset so the retry isn't blocked for 10 min.
        await releaseStalePendingCompositeLock(pending.id).catch(() => undefined);
        return NextResponse.json(
          { error: "Модель не смогла подготовить разбор. Попробуйте ещё раз — оплата сохранена." },
          { status: 502 }
        );
      }
      await failCompositeReport(pending.id, "empty_or_rejected");
      return NextResponse.json(
        {
          error: refundLanded
            ? "Модель не смогла подготовить разбор. Оплата возвращена."
            : "Модель не смогла подготовить разбор. Если руны списались, они вернутся автоматически.",
          refunded: refundLanded,
        },
        { status: 502 }
      );
    }

    const text = answer.trim() + DISCLAIMER;
    await completeCompositeReport(pending.id, text, "openrouter");
    completed = true; // past this point a catch must NOT refund a done report
    const done = await getHdCompositeReport(base.id, partner.id, userId);
    return NextResponse.json({
      report: done ? toPublicHdCompositeReport(done) : null,
      cached: false,
      runeBalance: charge?.newBalance,
    });
  } catch (error) {
    // Never refund a report that actually completed — a post-completion
    // failure (e.g. the final SELECT) must not turn into a free report.
    if (!completed) {
      await rollback().catch(() => {
        console.warn("[human-design] composite rollback failed");
      });
    }
    // A failed create+charge transaction rolled back atomically — no unpaid
    // placeholder to clean up, the next attempt starts clean.
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
      { error: "Ошибка генерации разбора.", refunded: refundLanded },
      { status: 502 }
    );
  }
}
