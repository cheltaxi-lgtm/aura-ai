/**
 * Destiny matrix for Telegram bot — same billing / buy-once rules as /api/reading.
 */
import { resolveUnlimitedAccess } from "@/lib/accounts";
import { PRICING } from "@/lib/config/pricing";
import { buildMemoryContext } from "@/lib/memory/build-memory-context";
import {
  destinyMatrix,
  MATRIX_CALCULATION_VERSION,
  type DestinyMatrixResult,
} from "@/lib/numerology/destiny-matrix";
import { buildMatrixFreeSummary } from "@/lib/numerology/matrix-free-summary";
import { getNumerologTool } from "@/lib/numerology/tools";
import {
  BillingService,
  InsufficientFundsError,
} from "@/lib/services/billing-service";
import { generateNumerologSessionReading } from "@/lib/services/numerology-service";
import {
  deleteOwnedMatrixReportsForBirth,
  deleteUserMatrixReport,
  findOwnedMatrixReport,
  getUserMatrixReportById,
  listUserMatrixReports,
  saveMatrixReport,
  toIsoBirthDate,
} from "@/lib/services/numerology-report-service";
import { createSession, updateSessionChatMeta } from "@/lib/session";
import { ensureSpreadReadingInChatMessages } from "@/lib/spread-reading-persist";
import { getRuneBalance, isRuneBillingActive } from "@/lib/rune-service";
import { getRuneSettings } from "@/lib/rune-settings";
import { resolveBotUser } from "@/lib/telegram/bot-resolve";
import { createHistoryEntry, getUserById } from "@/lib/users";

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://zovus.ru").replace(/\/$/, "");
}

/** Diagram payload for Telegram SVG renderer (mirrors DestinyMatrixGrid slots). */
export type BotMatrixDiagramSlot = {
  key: string;
  label: string;
  area: string;
  featured: boolean;
  number: number;
  arcanaName: string;
};

export type BotMatrixDiagram = {
  name: string | null;
  birthDate: string;
  slots: BotMatrixDiagramSlot[];
};

const DIAGRAM_SLOTS: Array<{
  key: keyof DestinyMatrixResult;
  label: string;
  area: string;
  featured?: boolean;
}> = [
  { key: "energy", label: "Энергия", area: "energy" },
  { key: "body", label: "Тело и характер", area: "body" },
  { key: "purpose", label: "Предназначение", area: "purpose", featured: true },
  { key: "roots", label: "Род и корни", area: "roots" },
  { key: "talents", label: "Таланты", area: "talents" },
  { key: "relationships", label: "Отношения", area: "rel" },
  { key: "money", label: "Деньги", area: "money" },
  { key: "paternal", label: "Род отца", area: "paternal" },
  { key: "maternal", label: "Род матери", area: "maternal" },
  { key: "karma", label: "Карма", area: "karma" },
  { key: "yearArcana", label: "Аркан года", area: "year" },
];

function buildMatrixDiagram(
  birthDate: string,
  name?: string | null
): BotMatrixDiagram | null {
  const matrix = destinyMatrix(birthDate);
  if (!matrix) return null;
  return {
    name: name?.trim() || null,
    birthDate,
    slots: DIAGRAM_SLOTS.map((slot) => {
      const point = matrix[slot.key];
      return {
        key: slot.key,
        label: slot.label,
        area: slot.area,
        featured: Boolean(slot.featured),
        number: point.number,
        arcanaName: point.arcanaName,
      };
    }),
  };
}

type GateFail = {
  ok: false;
  error: "needs_link" | "needs_onboarding" | "internal" | "insufficient_runes" | "not_found";
  message: string;
  linkUrl?: string;
  runeBalance?: number;
  cost?: number;
};

async function requireMatrixUser(telegramUserId: number) {
  const resolved = await resolveBotUser(telegramUserId);
  if (!resolved.linked || !resolved.accountId || !resolved.profileUserId) {
    return {
      ok: false as const,
      error: "needs_link" as const,
      message: "Привяжите аккаунт Zovus.",
      linkUrl: resolved.linkUrl,
    };
  }
  const user = await getUserById(resolved.profileUserId);
  if (!user?.birth_date) {
    return {
      ok: false as const,
      error: "needs_onboarding" as const,
      message: "Нужна дата рождения в профиле.",
      linkUrl: resolved.linkUrl,
    };
  }
  return { ok: true as const, resolved, user };
}

export async function botMatrixSummary(telegramUserId: number) {
  const gate = await requireMatrixUser(telegramUserId);
  if (!gate.ok) return gate;

  const summary = buildMatrixFreeSummary(gate.user.birth_date!, {
    name: gate.user.name || undefined,
  });
  if (!summary) {
    return {
      ok: false as const,
      error: "internal" as const,
      message: "Не удалось посчитать матрицу по дате рождения.",
    };
  }

  const owned = await findOwnedMatrixReport(gate.resolved.profileUserId!, gate.user.birth_date);
  const reports = await listUserMatrixReports(gate.resolved.profileUserId!, 20);
  const cost = getNumerologTool("destiny_matrix").cost || PRICING.NUMEROLOGY_SESSION;
  const runeBalance = await getRuneBalance(gate.resolved.profileUserId!);
  const diagram = buildMatrixDiagram(
    gate.user.birth_date!,
    gate.user.name || gate.resolved.name
  );

  return {
    ok: true as const,
    action: "summary" as const,
    birthDate: gate.user.birth_date,
    name: gate.user.name || gate.resolved.name || null,
    portrait: summary.portrait.slice(0, 900),
    moneyInsight: summary.moneyInsight.slice(0, 400),
    loveInsight: summary.loveInsight.slice(0, 400),
    yearInsight: summary.yearInsight.slice(0, 400),
    keyArcana: summary.keyArcana,
    diagram,
    savedReports: reports.length,
    owned: Boolean(owned?.content?.trim()),
    ownedReportId: owned?.id ?? null,
    cost,
    runeBalance,
    url: `${siteBase()}/cabinet?utm_source=telegram&utm_medium=bot&utm_campaign=numerology`,
    shopUrl: `${siteBase()}/runy?utm_source=telegram&utm_medium=bot&utm_campaign=matrix`,
  };
}

export async function botMatrixList(telegramUserId: number) {
  const gate = await requireMatrixUser(telegramUserId);
  if (!gate.ok) return gate;

  const reports = await listUserMatrixReports(gate.resolved.profileUserId!, 20);
  return {
    ok: true as const,
    action: "list" as const,
    items: reports.map((r) => ({
      id: r.id,
      birthDate: r.birthDate,
      date: r.createdAt.slice(0, 10),
      preview: r.content.replace(/\s+/g, " ").trim().slice(0, 220),
      sessionId: r.sessionId,
      runeCost: r.runeCost,
    })),
    url: `${siteBase()}/cabinet?utm_source=telegram&utm_medium=bot&utm_campaign=numerology`,
  };
}

export async function botMatrixGet(telegramUserId: number, reportId: string) {
  const gate = await requireMatrixUser(telegramUserId);
  if (!gate.ok) return gate;

  const report = await getUserMatrixReportById(gate.resolved.profileUserId!, reportId);
  if (!report?.content?.trim()) {
    return {
      ok: false as const,
      error: "not_found" as const,
      message: "Отчёт не найден.",
    };
  }

  return {
    ok: true as const,
    action: "get" as const,
    reportId: report.id,
    birthDate: report.birthDate,
    content: report.content,
    sessionId: report.sessionId,
    diagram: buildMatrixDiagram(
      report.birthDate,
      gate.user.name || gate.resolved.name
    ),
    url: report.sessionId
      ? `${siteBase()}/?chat_session=${encodeURIComponent(report.sessionId)}&utm_source=telegram&utm_medium=bot&utm_campaign=matrix`
      : `${siteBase()}/cabinet?utm_source=telegram&utm_medium=bot&utm_campaign=numerology`,
  };
}

export async function botMatrixRun(telegramUserId: number): Promise<
  | {
      ok: true;
      action: "run";
      reportId: string;
      sessionId: string;
      content: string;
      birthDate: string;
      runeBalance: number;
      charged: number;
      reused: boolean;
      url: string;
      diagram: BotMatrixDiagram | null;
    }
  | GateFail
> {
  const gate = await requireMatrixUser(telegramUserId);
  if (!gate.ok) return gate;

  const profileUserId = gate.resolved.profileUserId!;
  const birthDate = gate.user.birth_date!;
  const isoBirth = toIsoBirthDate(birthDate) ?? birthDate;
  const tool = getNumerologTool("destiny_matrix");
  const userName = gate.user.name || gate.resolved.name || "друг";
  const diagram = buildMatrixDiagram(isoBirth, userName);

  const owned = await findOwnedMatrixReport(profileUserId, isoBirth);
  if (owned?.content?.trim()) {
    const session = await createSession(undefined, profileUserId);
    await updateSessionChatMeta(session.id, {
      characterKey: "numerolog",
      intention: "destiny_matrix",
      spreadType: "new",
      spreadId: "destiny_matrix",
      cards: [],
    });
    await ensureSpreadReadingInChatMessages({
      sessionId: session.id,
      profileUserId,
      characterId: "numerolog",
      reading: owned.content,
      tarotCards: [],
      intention: "destiny_matrix",
      spreadType: "new",
      spreadId: "destiny_matrix",
      customQuestion: "Матрица судьбы",
    });
    const runeBalance = await getRuneBalance(profileUserId);
    return {
      ok: true,
      action: "run",
      reportId: owned.id,
      sessionId: session.id,
      content: owned.content,
      birthDate: isoBirth,
      runeBalance,
      charged: 0,
      reused: true,
      diagram,
      url: `${siteBase()}/?chat_session=${encodeURIComponent(session.id)}&utm_source=telegram&utm_medium=bot&utm_campaign=matrix`,
    };
  }

  const unlimited = await resolveUnlimitedAccess({
    accountId: gate.resolved.accountId,
    profileUserId,
  });
  const runeSettings = await getRuneSettings();
  const useRuneBilling = isRuneBillingActive(profileUserId, unlimited, runeSettings);

  let billingCharge: Awaited<ReturnType<typeof BillingService.chargeForSession>> | null = null;
  let runeBalance = await getRuneBalance(profileUserId);
  let charged = 0;

  if (useRuneBilling) {
    try {
      billingCharge = await BillingService.chargeForSession({
        userId: profileUserId,
        cost: tool.cost,
        actionType: "NUMEROLOGY_SESSION",
        description: "Матрица судьбы — полный разбор Эвелины",
      });
      runeBalance = billingCharge.newBalance;
      charged = billingCharge.spentRunes;
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        return {
          ok: false,
          error: "insufficient_runes",
          message: `Недостаточно рун: нужно ${err.required}, на балансе ${err.balance}. Пополните на сайте.`,
          runeBalance: err.balance,
          cost: err.required,
          linkUrl: `${siteBase()}/runy?utm_source=telegram&utm_medium=bot&utm_campaign=matrix`,
        };
      }
      throw err;
    }
  }

  const session = await createSession(undefined, profileUserId);
  await updateSessionChatMeta(session.id, {
    characterKey: "numerolog",
    intention: "destiny_matrix",
    spreadType: "new",
    spreadId: "destiny_matrix",
    cards: [],
  });

  try {
    const numerologMemoryCtx = await buildMemoryContext({
      userId: profileUserId,
      characterId: "numerolog",
      sessionId: session.id,
      profile: {
        name: userName,
        birthDate,
        mainQuestion: "Матрица судьбы",
      },
      lastUserMessage: "Построй мою матрицу судьбы",
      mainQuestion: "Матрица судьбы",
    });
    const numerologMemoryBlock =
      `${numerologMemoryCtx.clientBlock}${numerologMemoryCtx.pastSessionsBlock}${numerologMemoryCtx.factsBlock}`.trim() ||
      undefined;

    const sessionResult = await generateNumerologSessionReading({
      toolId: "destiny_matrix",
      userName,
      birthDate,
      fullName: userName,
      gender: gate.user.gender,
      spreadNumbers: [],
      memoryBlock: numerologMemoryBlock,
    });
    let reading = sessionResult.reply?.trim() || "";
    if (!reading) {
      throw new Error("empty_matrix_reading");
    }

    const matrix = destinyMatrix(birthDate);
    const saved = await saveMatrixReport({
      userId: profileUserId,
      birthDateRaw: birthDate,
      content: reading,
      runeCost: billingCharge?.spentRunes ?? tool.cost,
      chargeTransactionId: billingCharge?.transactionId,
      sessionId: session.id,
      structuredData: matrix
        ? { version: MATRIX_CALCULATION_VERSION, matrix }
        : { version: MATRIX_CALCULATION_VERSION },
    });

    if (saved.status === "already_saved") {
      reading = saved.report.content;
      if (billingCharge) {
        runeBalance = await BillingService.rollbackCharge({
          userId: profileUserId,
          cost: billingCharge.spentRunes,
          wasFreeQuestion: false,
          actionType: "NUMEROLOGY_SESSION",
          transactionId: billingCharge.transactionId,
        });
        charged = 0;
        billingCharge = null;
      }
    }

    await createHistoryEntry({
      userId: profileUserId,
      characterName: "numerolog",
      isPaid: charged > 0,
      contextData: {
        type: "reading",
        cards: [],
        interpretation: reading,
        question: "Матрица судьбы",
        sessionId: session.id,
        source: "telegram_bot",
        numerologToolId: "destiny_matrix",
      },
    });

    await ensureSpreadReadingInChatMessages({
      sessionId: session.id,
      profileUserId,
      characterId: "numerolog",
      reading,
      tarotCards: [],
      intention: "destiny_matrix",
      spreadType: "new",
      spreadId: "destiny_matrix",
      customQuestion: "Матрица судьбы",
    });

    return {
      ok: true,
      action: "run",
      reportId: saved.report.id,
      sessionId: session.id,
      content: reading,
      birthDate: isoBirth,
      runeBalance,
      charged,
      reused: saved.status === "already_saved",
      diagram,
      url: `${siteBase()}/?chat_session=${encodeURIComponent(session.id)}&utm_source=telegram&utm_medium=bot&utm_campaign=matrix`,
    };
  } catch (err) {
    console.error("[bot-matrix] run failed", err);
    if (billingCharge) {
      try {
        await BillingService.rollbackCharge({
          userId: profileUserId,
          cost: billingCharge.spentRunes,
          wasFreeQuestion: false,
          actionType: "NUMEROLOGY_SESSION",
          transactionId: billingCharge.transactionId,
        });
      } catch {
        /* ignore */
      }
    }
    return {
      ok: false,
      error: "internal",
      message: "Разбор не сложился. Руны не списаны — попробуйте ещё раз.",
    };
  }
}

export async function botMatrixDelete(input: {
  telegramUserId: number;
  reportId?: string;
}) {
  const gate = await requireMatrixUser(input.telegramUserId);
  if (!gate.ok) return gate;

  const profileUserId = gate.resolved.profileUserId!;
  let deleted = 0;
  if (input.reportId?.trim()) {
    deleted = (await deleteUserMatrixReport(profileUserId, input.reportId)) ? 1 : 0;
  } else {
    deleted = await deleteOwnedMatrixReportsForBirth(profileUserId, gate.user.birth_date);
  }

  if (deleted < 1) {
    return {
      ok: false as const,
      error: "not_found" as const,
      message: "Сохранённой матрицы не найдено.",
    };
  }

  return {
    ok: true as const,
    action: "delete" as const,
    deleted,
    message: "Матрица удалена. Можно рассчитать и получить разбор заново.",
  };
}

export async function botMatrixAction(input: {
  telegramUserId: number;
  action: "summary" | "list" | "get" | "run" | "delete";
  reportId?: string;
}) {
  switch (input.action) {
    case "list":
      return botMatrixList(input.telegramUserId);
    case "get":
      return botMatrixGet(input.telegramUserId, input.reportId || "");
    case "run":
      return botMatrixRun(input.telegramUserId);
    case "delete":
      return botMatrixDelete({
        telegramUserId: input.telegramUserId,
        reportId: input.reportId,
      });
    case "summary":
    default:
      return botMatrixSummary(input.telegramUserId);
  }
}
