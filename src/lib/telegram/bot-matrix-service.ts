/**
 * Destiny matrix for Telegram bot — same billing / buy-once rules as /api/reading.
 */
import { resolveUnlimitedAccess } from "@/lib/accounts";
import { PRICING } from "@/lib/config/pricing";
import { buildMemoryContext } from "@/lib/memory/build-memory-context";
import {
  DESTINY_MATRIX_DIAGRAM_SLOTS,
  destinyMatrix,
  isLegacyMatrixCalculationVersion,
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
  deleteOwnedMatrixReportsForSubject,
  findOwnedMatrixReport,
  findOwnedMatrixReportBySubject,
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
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
import { resolveBotUser } from "@/lib/telegram/bot-resolve";
import { createHistoryEntry, getUserById } from "@/lib/users";
import {
  deleteMatrixSubject,
  ensureSelfSubject,
  getMatrixSubject,
  isMatrixSubjectKind,
  listMatrixSubjects,
  upsertMatrixSubject,
} from "@/lib/services/matrix-subject-service";

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

export async function botMatrixSummary(telegramUserId: number, subjectId?: string) {
  const gate = await requireMatrixUser(telegramUserId);
  if (!gate.ok) return gate;

  const subject = subjectId
    ? await getMatrixSubject(gate.resolved.profileUserId!, subjectId)
    : await ensureSelfSubject(gate.resolved.profileUserId!);
  if (subjectId && !subject) return { ok: false as const, error: "not_found" as const, message: "Субъект матрицы не найден." };
  const subjectBirthDate = subject?.birthDate ?? gate.user.birth_date!;
  const subjectName = subject?.displayName?.trim() || gate.user.name || undefined;
  const summary = buildMatrixFreeSummary(subjectBirthDate, {
    name: subjectName,
  });
  if (!summary) {
    return {
      ok: false as const,
      error: "internal" as const,
      message: "Не удалось посчитать матрицу по дате рождения.",
    };
  }

  // Ownership + diagram must follow the selected subject, not the account profile —
  // otherwise a child's summary showed the parent's matrix and "owned" flag.
  const toolId = subject?.kind === "child" ? "child_matrix" : "destiny_matrix";
  const owned = subject?.id
    ? await findOwnedMatrixReportBySubject(gate.resolved.profileUserId!, subject.id, { toolId })
    : await findOwnedMatrixReport(gate.resolved.profileUserId!, subjectBirthDate, { toolId });
  const reports = await listUserMatrixReports(gate.resolved.profileUserId!, 20);
  const cost = getNumerologTool(toolId).cost || PRICING.NUMEROLOGY_SESSION;
  const runeBalance = await getRuneBalance(gate.resolved.profileUserId!);
  const diagram = buildMatrixDiagram(
    subjectBirthDate,
    subjectName || gate.resolved.name
  );
  // Legacy-reducer reports are not offerable as "owned" — they owe a free rebuild.
  const summaryOwnedUsable = Boolean(
    owned?.content?.trim() &&
      !isLegacyMatrixCalculationVersion(owned.calculationVersion) &&
      isUsableMatrixReading(owned.content)
  );
  const currentStructured = summary.matrix
    ? matrixToStructuredData(summary.matrix)
    : null;
  // Never diff across reducer generations: every point would "change" spuriously.
  const prevStructured =
    owned?.structuredData &&
    typeof owned.structuredData === "object" &&
    !isLegacyMatrixCalculationVersion(owned.calculationVersion)
      ? (owned.structuredData as Record<string, unknown>)
      : null;
  const sinceLast =
    currentStructured && prevStructured
      ? formatMatrixDiffTeaser(diffMatrixStructured(prevStructured, currentStructured))
      : null;

  return {
    ok: true as const,
    action: "summary" as const,
    birthDate: subjectBirthDate,
    name: subjectName || gate.resolved.name || null,
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
      name: subjectName || gate.resolved.name,
      birthDate: subjectBirthDate,
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
    owned: Boolean(summaryOwnedUsable),
    ownedReportId: summaryOwnedUsable ? owned!.id : null,
    cost,
    runeBalance,
    url: `${siteBase()}/cabinet?utm_source=telegram&utm_medium=bot&utm_campaign=numerology`,
    shopUrl: `${siteBase()}/cabinet?shop=1&utm_source=telegram&utm_medium=bot&utm_campaign=matrix`,
  };
}

export async function botMatrixList(telegramUserId: number, _subjectId?: string) {
  const gate = await requireMatrixUser(telegramUserId);
  if (!gate.ok) return gate;

  const reports = await listUserMatrixReports(gate.resolved.profileUserId!, 20);
  const cost = getNumerologTool("destiny_matrix").cost || PRICING.NUMEROLOGY_SESSION;
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
    cost,
    sessionCost: cost,
    url: `${siteBase()}/cabinet?utm_source=telegram&utm_medium=bot&utm_campaign=numerology`,
  };
}

export async function botMatrixGet(telegramUserId: number, reportId: string, _subjectId?: string) {
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
  if (isLegacyMatrixCalculationVersion(report.calculationVersion)) {
    return {
      ok: false as const,
      error: "not_found" as const,
      message:
        "Метод расчёта матрицы обновлён до канонического. Нажмите «Получить матрицу» — пересоберём бесплатно.",
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
  opts?: { replace?: boolean; subjectId?: string }
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
      pending?: boolean;
      message?: string;
    }
  | GateFail
> {
  const gate = await requireMatrixUser(telegramUserId);
  if (!gate.ok) return gate;

  const profileUserId = gate.resolved.profileUserId!;
  const subject = opts?.subjectId
    ? await getMatrixSubject(profileUserId, opts.subjectId)
    : await ensureSelfSubject(profileUserId);
  if (opts?.subjectId && !subject) {
    return { ok: false, error: "not_found" as const, message: "Субъект матрицы не найден." };
  }
  const birthDate = subject?.birthDate ?? gate.user.birth_date!;
  const isoBirth = toIsoBirthDate(birthDate) ?? birthDate;
  const toolId = subject?.kind === "child" ? "child_matrix" : "destiny_matrix";
  const tool = getNumerologTool(toolId);
  const chargeAction =
    toolId === "child_matrix"
      ? "CHILD_MATRIX_REPORT"
      : subject && subject.kind !== "self"
        ? "MATRIX_SUBJECT_REPORT"
        : "NUMEROLOGY_SESSION";
  const readerName =
    normalizePersonDisplayName(gate.user.name || gate.resolved.name) ||
    gate.user.name ||
    gate.resolved.name ||
    "друг";
  const subjectName =
    normalizePersonDisplayName(subject?.displayName || "") ||
    subject?.displayName?.trim() ||
    readerName;
  const diagram = buildMatrixDiagram(isoBirth, subjectName);
  const replace = Boolean(opts?.replace);

  const owned = subject?.id
    ? await findOwnedMatrixReportBySubject(profileUserId, subject.id, { toolId })
    : await findOwnedMatrixReport(profileUserId, isoBirth, { toolId });
  // Pre-v3 reports hold digit-sum numbers the engine can't reproduce — rebuild free.
  const ownedLegacy = Boolean(
    owned?.content?.trim() && isLegacyMatrixCalculationVersion(owned.calculationVersion)
  );
  const ownedUsable = Boolean(
    owned?.content?.trim() && !ownedLegacy && isUsableMatrixReading(owned.content)
  );

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

  // Bad/leaked/legacy owned report (or explicit replace): wipe before regenerating.
  // Rebuild is free — the client already paid for text we can no longer serve.
  // Always subject-scoped — never wipe every report sharing a birth date.
  const regenerateAfterLeak = Boolean(owned?.content?.trim() && !ownedUsable && !replace);
  const keepLegacyArtifact = Boolean(ownedLegacy && !replace && owned);
  if (ownedLegacy && !replace && owned) {
    // Site parity: keep the readable paid artifact, drop only its stale chat.
    const staleSession = owned.sessionId?.trim();
    if (staleSession) {
      await purgeMatrixConsultationSessions(profileUserId, [staleSession]);
    }
  } else if ((replace || regenerateAfterLeak) && owned) {
    const subjectForWipe = subject ?? (await ensureSelfSubject(profileUserId));
    const wiped = subjectForWipe?.id
      ? await deleteOwnedMatrixReportsForSubject(profileUserId, subjectForWipe.id, {
          toolId,
        })
      : await deleteOwnedMatrixReportsForBirth(profileUserId, isoBirth);
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
        actionType: chargeAction,
        description: `${subject?.kind === "child" ? "Детская" : "Полная"} матрица — разбор Эвелины`,
        idempotencyKey: subject?.id
          ? `tg-matrix:${subject.id}:${chargeAction}:${tool.cost}`
          : undefined,
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

  // Charge dedupe: never re-generate — reopen owned report or point to cabinet.
  if (billingCharge?.deduplicated) {
    const ownedAgain = subject?.id
      ? await findOwnedMatrixReportBySubject(profileUserId, subject.id, { toolId })
      : await findOwnedMatrixReport(profileUserId, isoBirth, { toolId });
    if (ownedAgain?.content?.trim() && isUsableMatrixReading(ownedAgain.content)) {
      let sessionId = ownedAgain.sessionId?.trim() || "";
      if (!sessionId) {
        const session = await createSession(undefined, profileUserId);
        sessionId = session.id;
      }
      const safeOwned = sanitizeReadingForClient(ownedAgain.content) || ownedAgain.content;
      return {
        ok: true,
        action: "run",
        reportId: ownedAgain.id,
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
    return {
      ok: true,
      action: "run",
      reportId: ownedAgain?.id ?? "",
      sessionId: ownedAgain?.sessionId ?? "",
      content: "",
      pending: true,
      birthDate: isoBirth,
      runeBalance,
      charged: 0,
      reused: true,
      replaced: false,
      diagram,
      message: "Разбор уже выполняется — откройте кабинет.",
      url: `${siteBase()}/cabinet?utm_source=telegram&utm_medium=bot&utm_campaign=matrix`,
    };
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
      product: "matrix",
      depth: "deep",
      sessionId: session.id,
      profile: {
        name: readerName,
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
      toolId,
      userName: readerName,
      birthDate,
      fullName: readerName,
      gender: gate.user.gender,
      spreadNumbers: [],
      memoryBlock: numerologMemoryBlock,
      birthTime: gate.user.birth_time,
      birthCity: gate.user.birth_city,
      userId: profileUserId,
      subjectKind: subject?.kind ?? "self",
      subjectName,
    });
    const rawReading = sessionResult.reply?.trim() || "";
    let reading = sanitizeReadingForClient(rawReading) || rawReading;
    const matrix = destinyMatrix(birthDate);
    if (matrix && (!isUsableMatrixReading(reading) || !reading.trim())) {
      const { buildMatrixAudience } = await import("@/lib/numerology/matrix-audience");
      reading = forceFillMissingSections(
        reading || "",
        matrix,
        buildMatrixAudience({
          subjectKind: subject?.kind ?? "self",
          readerName,
          readerGender: gate.user.gender,
          subjectName,
        }),
        null,
        toolId
      );
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
      subjectId: subject?.id,
      // New paid order always replaces any prior report for this birth date. A free
      // pre-v3 rebuild must not: overwrite deletes every calculation version for the
      // subject, which would destroy the paid artifact the site deliberately keeps.
      overwrite: !keepLegacyArtifact,
    });

    if (saved.status === "already_saved") {
      reading = saved.report.content;
      if (billingCharge) {
        runeBalance = await BillingService.rollbackCharge({
          userId: profileUserId,
          cost: billingCharge.spentRunes,
          wasFreeQuestion: false,
          actionType: chargeAction,
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
        numerologToolId: toolId,
        ...(subject
          ? {
              matrixSubjectId: subject.id,
              subjectKind: subject.kind,
              subjectName: subject.displayName,
            }
          : {}),
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
          actionType: chargeAction,
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
  subjectId?: string;
}) {
  const gate = await requireMatrixUser(input.telegramUserId);
  if (!gate.ok) return gate;

  const profileUserId = gate.resolved.profileUserId!;
  const subject =
    (input.subjectId?.trim()
      ? await getMatrixSubject(profileUserId, input.subjectId.trim())
      : null) ??
    (!input.reportId?.trim() ? await ensureSelfSubject(profileUserId) : null);
  const wiped = await wipeUserMatrixReports({
    userId: profileUserId,
    reportId: input.reportId,
    subjectId: subject?.id ?? input.subjectId ?? null,
    // Never wipe by profile birth alone — that erased self when deleting another person.
    birthDate: null,
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
  action: "summary" | "list" | "get" | "run" | "delete" | "subjects" | "subjects.list" | "subjects.create" | "subjects.delete";
  reportId?: string;
  replace?: boolean;
  subjectId?: string;
  kind?: string;
  displayName?: string;
  birthDate?: string;
}) {
  switch (input.action) {
    case "subjects":
    case "subjects.list": {
      const gate = await requireMatrixUser(input.telegramUserId);
      if (!gate.ok) return gate;
      await ensureSelfSubject(gate.resolved.profileUserId!);
      return { ok: true as const, action: "subjects", subjects: await listMatrixSubjects(gate.resolved.profileUserId!) };
    }
    case "subjects.create": {
      const gate = await requireMatrixUser(input.telegramUserId);
      if (!gate.ok) return gate;
      if (!input.kind || !isMatrixSubjectKind(input.kind) || !input.birthDate) {
        return { ok: false as const, error: "internal" as const, message: "Укажите вид, имя и дату рождения." };
      }
      try {
        const subject = await upsertMatrixSubject({ userId: gate.resolved.profileUserId!, kind: input.kind, displayName: input.displayName, birthDate: input.birthDate });
        return { ok: true as const, action: "subjects.create", subject };
      } catch (error) {
        return { ok: false as const, error: "internal" as const, message: error instanceof Error && error.message === "invalid_birth_date" ? "Некорректная дата рождения." : "Не удалось сохранить субъекта." };
      }
    }
    case "subjects.delete": {
      const gate = await requireMatrixUser(input.telegramUserId);
      if (!gate.ok) return gate;
      if (!input.subjectId) return { ok: false as const, error: "not_found" as const, message: "Субъект не выбран." };
      const result = await deleteMatrixSubject(gate.resolved.profileUserId!, input.subjectId);
      if (!result.deleted) {
        return { ok: false as const, error: "not_found" as const, message: "Субъект не найден." };
      }
      // Site parity: dropping a subject also purges its orphaned matrix chats.
      const purgedSessions = await purgeMatrixConsultationSessions(
        gate.resolved.profileUserId!,
        result.sessionIds
      );
      return { ok: true as const, action: "subjects.delete", ...result, purgedSessions };
    }
    case "list":
      return botMatrixList(input.telegramUserId, input.subjectId);
    case "get":
      return botMatrixGet(input.telegramUserId, input.reportId || "", input.subjectId);
    case "run":
      return botMatrixRun(input.telegramUserId, { replace: input.replace, subjectId: input.subjectId });
    case "delete":
      return botMatrixDelete({
        telegramUserId: input.telegramUserId,
        reportId: input.reportId,
        subjectId: input.subjectId,
      });
    case "summary":
    default:
      return botMatrixSummary(input.telegramUserId, input.subjectId);
  }
}
