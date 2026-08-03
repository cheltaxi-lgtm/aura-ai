/**
 * Destiny matrix for Telegram bot — same billing / buy-once rules as /api/reading.
 */
import { resolveUnlimitedAccess } from "@/lib/accounts";
import { PRICING } from "@/lib/config/pricing";
import { buildMemoryContext } from "@/lib/memory/build-memory-context";
import {
  DESTINY_MATRIX_DIAGRAM_SLOTS,
  destinyMatrix,
  MATRIX_CALCULATION_VERSION,
  matrixToStructuredData,
} from "@/lib/numerology/destiny-matrix";
import { diffMatrixStructured, formatMatrixDiffTeaser } from "@/lib/numerology/matrix-diff";
import {
  buildMatrixFreeSummary,
  formatMatrixDenseTeaser,
} from "@/lib/numerology/matrix-free-summary";
import { getNumerologTool } from "@/lib/numerology/tools";
import {
  BillingService,
  InsufficientFundsError,
} from "@/lib/services/billing-service";
import { generateNumerologSessionReading } from "@/lib/services/numerology-service";
import {
  purgeMatrixConsultationSessions,
  wipeUserMatrixReports,
} from "@/lib/numerology/matrix-session-cleanup";
import {
  deleteOwnedMatrixReportsForBirth,
  findOwnedMatrixReport,
  getUserMatrixReportById,
  listUserMatrixReports,
  saveMatrixReport,
  toIsoBirthDate,
} from "@/lib/services/numerology-report-service";
import { query } from "@/lib/db";
import {
  createSession,
  getSession,
  updateSessionChatMeta,
} from "@/lib/session";
import { ensureSpreadReadingInChatMessages } from "@/lib/spread-reading-persist";
import { getRuneBalance, isRuneBillingActive } from "@/lib/rune-service";
import { getRuneSettings } from "@/lib/rune-settings";
import {
  isUsableMatrixReading,
  sanitizeReadingForClient,
} from "@/lib/chat-reply-sanitize";
import { forceFillMissingSections } from "@/lib/numerology/matrix-sectioned-reading";
import { resolveClientGender } from "@/lib/russian-name-gender";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
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
  focusKey?: string | null;
};

function buildMatrixDiagram(
  birthDate: string,
  name?: string | null
): BotMatrixDiagram | null {
  const matrix = destinyMatrix(birthDate);
  if (!matrix) return null;
  return {
    name: name?.trim() || null,
    birthDate,
    focusKey: matrix.focusKey,
    slots: DESTINY_MATRIX_DIAGRAM_SLOTS.map((slot) => {
      const point = slot.pick(matrix);
      return {
        key: String(slot.key),
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
  const currentStructured = summary.matrix
    ? matrixToStructuredData(summary.matrix)
    : null;
  const prevStructured =
    owned?.structuredData && typeof owned.structuredData === "object"
      ? (owned.structuredData as Record<string, unknown>)
      : null;
  const sinceLast =
    currentStructured && prevStructured
      ? formatMatrixDiffTeaser(diffMatrixStructured(prevStructured, currentStructured))
      : null;

  return {
    ok: true as const,
    action: "summary" as const,
    birthDate: gate.user.birth_date,
    name: gate.user.name || gate.resolved.name || null,
    portrait: summary.portrait.slice(0, 900),
    moneyInsight: summary.moneyInsight.slice(0, 400),
    loveInsight: summary.loveInsight.slice(0, 400),
    yearInsight: summary.yearInsight.slice(0, 400),
    comfortInsight: summary.comfortInsight.slice(0, 400),
    karmicInsight: summary.karmicInsight.slice(0, 400),
    ageInsight: summary.ageInsight.slice(0, 300),
    periodTeaser: summary.period.teaser.slice(0, 500),
    focusLabel: summary.period.focusLabel,
    focusKey: summary.period.focusKey,
    focusNumber: summary.period.focusNumber,
    focusTitle: summary.period.focusTitle,
    practiceSeed: summary.period.practiceSeed,
    denseTeaser: formatMatrixDenseTeaser(summary, {
      name: gate.user.name || gate.resolved.name,
      birthDate: gate.user.birth_date,
      withCta: false,
    }).slice(0, 1600),
    sinceLast,
    shareCard: [
      summary.period.focusLabel,
      `${summary.period.focusTitle} (${summary.period.focusNumber})`,
      summary.period.practiceSeed,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 280),
    keyArcana: summary.keyArcana,
    diagram,
    savedReports: reports.length,
    owned: Boolean(owned?.content?.trim() && isUsableMatrixReading(owned.content)),
    ownedReportId:
      owned?.content?.trim() && isUsableMatrixReading(owned.content) ? owned.id : null,
    cost,
    runeBalance,
    url: `${siteBase()}/cabinet?utm_source=telegram&utm_medium=bot&utm_campaign=numerology`,
    shopUrl: `${siteBase()}/cabinet?shop=1&utm_source=telegram&utm_medium=bot&utm_campaign=matrix`,
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
  if (!isUsableMatrixReading(report.content)) {
    return {
      ok: false as const,
      error: "not_found" as const,
      message: "Отчёт повреждён. Нажмите «Получить матрицу» — пересоберём бесплатно.",
    };
  }

  return {
    ok: true as const,
    action: "get" as const,
    reportId: report.id,
    birthDate: report.birthDate,
    content: sanitizeReadingForClient(report.content) || report.content,
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

export async function botMatrixRun(
  telegramUserId: number,
  opts?: { replace?: boolean }
): Promise<
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
      replaced: boolean;
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
  const userName =
    normalizePersonDisplayName(gate.user.name || gate.resolved.name) ||
    gate.user.name ||
    gate.resolved.name ||
    "друг";
  const diagram = buildMatrixDiagram(isoBirth, userName);
  const replace = Boolean(opts?.replace);

  const owned = await findOwnedMatrixReport(profileUserId, isoBirth);
  const ownedUsable = Boolean(owned?.content?.trim() && isUsableMatrixReading(owned.content));

  // Open existing only when not explicitly ordering a replacement and content is client-safe.
  if (ownedUsable && owned && !replace) {
    let sessionId = owned.sessionId?.trim() || "";
    if (sessionId) {
      const existing = await getSession(sessionId);
      if (!existing || existing.user_id !== profileUserId) sessionId = "";
    }
    if (!sessionId) {
      const session = await createSession(undefined, profileUserId);
      sessionId = session.id;
      await query(
        `UPDATE numerology_report_history
         SET session_id = $1, updated_at = NOW()
         WHERE id = $2::uuid AND user_id = $3`,
        [sessionId, owned.id, profileUserId]
      );
    }
    await updateSessionChatMeta(sessionId, {
      characterKey: "numerolog",
      intention: "destiny_matrix",
      spreadType: "new",
      spreadId: "destiny_matrix",
      cards: [],
    });
    const safeOwned = sanitizeReadingForClient(owned.content) || owned.content;
    await ensureSpreadReadingInChatMessages({
      sessionId,
      profileUserId,
      characterId: "numerolog",
      reading: safeOwned,
      tarotCards: [],
      intention: "destiny_matrix",
      spreadType: "new",
      spreadId: "destiny_matrix",
      customQuestion: "Матрица судьбы",
    });
    await purgeMatrixConsultationSessions(profileUserId, []);
    const runeBalance = await getRuneBalance(profileUserId);
    return {
      ok: true,
      action: "run",
      reportId: owned.id,
      sessionId,
      content: safeOwned,
      birthDate: isoBirth,
      runeBalance,
      charged: 0,
      reused: true,
      replaced: false,
      diagram,
      url: `${siteBase()}/?chat_session=${encodeURIComponent(sessionId)}&utm_source=telegram&utm_medium=bot&utm_campaign=matrix`,
    };
  }

  // Bad/leaked owned report (or explicit replace): wipe before regenerating.
  // Regeneration after a leak is free — client already paid for unusable text.
  const regenerateAfterLeak = Boolean(owned?.content?.trim() && !ownedUsable && !replace);
  if ((replace || regenerateAfterLeak) && owned) {
    const wiped = await deleteOwnedMatrixReportsForBirth(profileUserId, isoBirth);
    await purgeMatrixConsultationSessions(profileUserId, wiped.sessionIds);
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

  if (useRuneBilling && !regenerateAfterLeak) {
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
          linkUrl: `${siteBase()}/cabinet?shop=1&utm_source=telegram&utm_medium=bot&utm_campaign=matrix`,
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
      birthTime: gate.user.birth_time,
      birthCity: gate.user.birth_city,
      userId: profileUserId,
    });
    const rawReading = sessionResult.reply?.trim() || "";
    let reading = sanitizeReadingForClient(rawReading) || rawReading;
    const matrix = destinyMatrix(birthDate);
    if (matrix && (!isUsableMatrixReading(reading) || !reading.trim())) {
      const gender = resolveClientGender(gate.user.gender, userName);
      reading = forceFillMissingSections(reading || "", matrix, userName, gender);
      reading = sanitizeReadingForClient(reading) || reading;
    }
    if (!isUsableMatrixReading(reading) || !reading.trim()) {
      throw new Error("matrix_prompt_leak_or_empty");
    }
    const { matrixReadingToStructuredPayload } = await import(
      "@/lib/numerology/matrix-reading-document"
    );
    const structuredBase = matrix
      ? matrixToStructuredData(matrix)
      : { version: MATRIX_CALCULATION_VERSION };
    const saved = await saveMatrixReport({
      userId: profileUserId,
      birthDateRaw: birthDate,
      content: reading,
      runeCost: billingCharge?.spentRunes ?? tool.cost,
      chargeTransactionId: billingCharge?.transactionId,
      sessionId: session.id,
      structuredData: {
        ...structuredBase,
        ...(sessionResult.matrixDocument
          ? { reading: matrixReadingToStructuredPayload(sessionResult.matrixDocument) }
          : {}),
      },
      // New paid order always replaces any prior report for this birth date.
      overwrite: true,
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
      replaced: replace || saved.status === "updated",
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
  const wiped = await wipeUserMatrixReports({
    userId: profileUserId,
    reportId: input.reportId,
    birthDate: input.reportId?.trim() ? null : gate.user.birth_date,
  });

  if (wiped.deletedReports < 1) {
    return {
      ok: false as const,
      error: "not_found" as const,
      message: "Сохранённой матрицы не найдено.",
    };
  }

  const cost = getNumerologTool("destiny_matrix").cost || PRICING.NUMEROLOGY_SESSION;
  const runeBalance = await getRuneBalance(profileUserId);

  return {
    ok: true as const,
    action: "delete" as const,
    deleted: wiped.deletedReports,
    cost,
    runeBalance,
    message: "Матрица удалена. Можно рассчитать и получить разбор заново.",
  };
}

export async function botMatrixAction(input: {
  telegramUserId: number;
  action: "summary" | "list" | "get" | "run" | "delete";
  reportId?: string;
  replace?: boolean;
}) {
  switch (input.action) {
    case "list":
      return botMatrixList(input.telegramUserId);
    case "get":
      return botMatrixGet(input.telegramUserId, input.reportId || "");
    case "run":
      return botMatrixRun(input.telegramUserId, { replace: input.replace });
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
