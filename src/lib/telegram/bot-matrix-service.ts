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
  type DestinyMatrixResult,
} from "@/lib/numerology/destiny-matrix";
import { matrixCalendarDate } from "@/lib/numerology/matrix-calendar";
import { buildMatrixDiagramSvgFromResult } from "@/lib/numerology/matrix-diagram-svg";
import {
  resolveMatrixForDisplay,
  resolveMatrixForDisplayDetailed,
  resolveMatrixForEngine,
} from "@/lib/numerology/matrix-snapshot";
import { ensureOwnedMatrixSnapshot } from "@/lib/services/matrix-snapshot-persist";
import { clientSafeMatrixResolveError } from "@/lib/numerology/matrix-labels";
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
import { bindBotChargeSession, findSessionIdForBotCharge, normalizeBotClientEventId } from "@/lib/telegram/bot-charge-idempotency";
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
  svg?: string | null;
};

function buildMatrixDiagramFromResult(
  matrix: DestinyMatrixResult | null,
  birthDate: string,
  name?: string | null
): BotMatrixDiagram | null {
  if (!matrix) return null;
  return {
    name: name?.trim() || null,
    birthDate,
    focusKey: matrix.focusKey,
    svg: buildMatrixDiagramSvgFromResult(matrix, {
      theme: "dark",
      density: "full",
      showPeriod: false,
      uid: "tg",
    }),
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

function buildLiveMatrixDiagram(birthDate: string, name?: string | null): BotMatrixDiagram | null {
  return buildMatrixDiagramFromResult(
    destinyMatrix(birthDate, { asOfDate: matrixCalendarDate() }),
    birthDate,
    name
  );
}

function diagramForSavedReport(
  report: {
    birthDate: string;
    structuredData: Record<string, unknown> | null;
    calculationVersion: string;
    createdAt: string;
  },
  name?: string | null
): BotMatrixDiagram | null {
  return buildMatrixDiagramFromResult(
    resolveMatrixForDisplay({
      birthDate: report.birthDate,
      structuredData: report.structuredData,
      calculationVersion: report.calculationVersion,
      createdAt: report.createdAt,
    }),
    report.birthDate,
    name
  );
}

type GateFail = {
  ok: false;
  error: "needs_link" | "needs_onboarding" | "internal" | "insufficient_runes" | "not_found" | "operation_required" | "operation_failed" | "not_available";
  message: string;
  linkUrl?: string;
  runeBalance?: number;
  cost?: number;
  refunded?: boolean;
};

type MatrixOperationIntent = { input: { subjectId: string | null; toolId: string; birthDate: string };
  session_id: string | null; status: string; expired: boolean; billing_required: boolean };

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
  // Ownership + diagram must follow the selected subject, not the account profile —
  // otherwise a child's summary showed the parent's matrix and "owned" flag.
  const toolId = subject?.kind === "child" ? "child_matrix" : "destiny_matrix";
  const owned = subject?.id
    ? await findOwnedMatrixReportBySubject(gate.resolved.profileUserId!, subject.id, { toolId })
    : await findOwnedMatrixReport(gate.resolved.profileUserId!, subjectBirthDate, { toolId });
  const savedMatrix = owned
    ? resolveMatrixForDisplayDetailed({
        birthDate: subjectBirthDate,
        structuredData: owned.structuredData,
        calculationVersion: owned.calculationVersion,
        createdAt: owned.createdAt,
      })
    : null;
  if (savedMatrix && !savedMatrix.ok) {
    return {
      ok: false as const,
      error: "not_found" as const,
      message: clientSafeMatrixResolveError(savedMatrix.error),
    };
  }
  const summary = buildMatrixFreeSummary(subjectBirthDate, {
    name: subjectName,
    ...(savedMatrix?.ok ? { matrix: savedMatrix.matrix } : {}),
  });
  if (!summary) {
    return {
      ok: false as const,
      error: "internal" as const,
      message: "Не удалось посчитать матрицу по дате рождения.",
    };
  }
  const reports = await listUserMatrixReports(gate.resolved.profileUserId!, 20);
  const cost = getNumerologTool(toolId).cost || PRICING.NUMEROLOGY_SESSION;
  const runeBalance = await getRuneBalance(gate.resolved.profileUserId!);
  const diagram = owned
    ? diagramForSavedReport(owned, subjectName || gate.resolved.name)
    : buildLiveMatrixDiagram(subjectBirthDate, subjectName || gate.resolved.name);
  const summaryOwnedUsable = Boolean(
    owned?.content?.trim() && isUsableMatrixReading(owned.content, toolId)
  );
  const currentStructured = summary.matrix
    ? matrixToStructuredData(summary.matrix)
    : null;
  // Never diff across reducer generations: every point would "change" spuriously.
  const sameGeneration =
    Boolean(owned?.calculationVersion) &&
    owned!.calculationVersion === summary.matrix.calculationVersion &&
    !isLegacyMatrixCalculationVersion(owned!.calculationVersion);
  const prevStructured =
    sameGeneration && owned?.structuredData && typeof owned.structuredData === "object"
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
    subjectId: subject?.id ?? null,
    subjectKind: subject?.kind ?? null,
    subjectName: subjectName ?? null,
    subject: subject ? { id: subject.id, kind: subject.kind, displayName: subject.displayName, birthDate: subject.birthDate } : null,
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
      subjectId: r.subjectId,
      toolId: r.toolId,
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
  if (!isUsableMatrixReading(report.content, report.toolId)) {
    return {
      ok: false as const,
      error: "not_found" as const,
      message: "Отчёт повреждён. Откройте сохранённый текст в кабинете или закажите новый расчёт.",
    };
  }
  const subject = report.subjectId
    ? await getMatrixSubject(gate.resolved.profileUserId!, report.subjectId)
    : null;
  const subjectName = subject?.displayName?.trim() || null;

  return {
    ok: true as const,
    action: "get" as const,
    reportId: report.id,
    subjectId: report.subjectId,
    subjectKind: subject?.kind ?? null,
    subjectName,
    subject: subject ? { id: subject.id, kind: subject.kind, displayName: subject.displayName, birthDate: subject.birthDate } : null,
    birthDate: report.birthDate,
    content: sanitizeReadingForClient(report.content) || report.content,
    sessionId: report.sessionId,
    diagram: diagramForSavedReport(report, subjectName),
    url: report.sessionId
      ? `${siteBase()}/?chat_session=${encodeURIComponent(report.sessionId)}&utm_source=telegram&utm_medium=bot&utm_campaign=matrix`
      : `${siteBase()}/cabinet?utm_source=telegram&utm_medium=bot&utm_campaign=numerology`,
  };
}

export async function botMatrixRun(
  telegramUserId: number,
  opts?: { replace?: boolean; subjectId?: string; operationId?: string }
): Promise<
  | {
      ok: true;
      action: "run";
      reportId: string;
      subjectId: string | null;
      subjectKind: string | null;
      subjectName: string;
      subject: { id: string; kind: string; displayName: string | null; birthDate: string } | null;
      operationId?: string;
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
      diagramUnavailable?: boolean;
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
  const replace = Boolean(opts?.replace);
  const operationId = normalizeBotClientEventId(opts?.operationId);
  const operationInput = { subjectId: subject?.id ?? null, toolId, birthDate: isoBirth };
  let operationIntent = operationId ? (await query<MatrixOperationIntent>(`SELECT input, session_id, status, billing_required,
    created_at < NOW() - INTERVAL '30 minutes' AS expired FROM bot_matrix_operations
    WHERE user_id = $1 AND operation_id = $2`, [profileUserId, operationId])).rows[0] : undefined;
  let freeReplay = Boolean(operationIntent && !operationIntent.billing_required);
  let freeClaimed = false;
  const subjectIdentity = {
    subjectId: subject?.id ?? null, subjectKind: subject?.kind ?? null, subjectName,
    subject: subject ? { id: subject.id, kind: subject.kind, displayName: subject.displayName, birthDate: subject.birthDate } : null,
  };

  const owned = subject?.id
    ? await findOwnedMatrixReportBySubject(profileUserId, subject.id, { toolId })
    : await findOwnedMatrixReport(profileUserId, isoBirth, { toolId });
  const ownedUsable = Boolean(
    owned?.content?.trim() && isUsableMatrixReading(owned.content, toolId)
  );
  const diagram = owned
    ? diagramForSavedReport(owned, subjectName)
    : buildLiveMatrixDiagram(isoBirth, subjectName);

  // Open existing only when not explicitly ordering a replacement and content is client-safe.
  if (ownedUsable && owned && !replace && !operationIntent) {
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
      ...subjectIdentity,
      operationId: operationId ?? undefined,
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

  if (!operationId) {
    return { ok: false, error: "operation_required", message: "Откройте матрицу заново и подтвердите расчёт." };
  }

  // Unusable text: drop only that calculation version, then regenerate.
  // Explicit replace overwrites the current calculation version; rows for other
  // calculation versions remain in the archive.
  const regenerateAfterLeak = Boolean(owned?.content?.trim() && !ownedUsable && !replace);

  const unlimited = await resolveUnlimitedAccess({
    accountId: gate.resolved.accountId,
    profileUserId,
  });
  const runeSettings = await getRuneSettings();
  const useRuneBilling = isRuneBillingActive(profileUserId, unlimited, runeSettings);

  let billingCharge: Awaited<ReturnType<typeof BillingService.chargeForSession>> | null = null;
  let runeBalance = await getRuneBalance(profileUserId);
  let charged = 0;

  if (!operationIntent) {
    const claimed = await query<MatrixOperationIntent>(`INSERT INTO bot_matrix_operations (user_id, operation_id, input, billing_required)
      VALUES ($1, $2, $3::jsonb, $4 OR EXISTS (SELECT 1 FROM rune_transactions
        WHERE user_id = $1 AND type = 'spend' AND idempotency_key = $5))
      ON CONFLICT (user_id, operation_id) DO NOTHING
      RETURNING input, session_id, status, billing_required, false AS expired`,
    [profileUserId, operationId, JSON.stringify(operationInput), useRuneBilling && !regenerateAfterLeak,
      `tg-matrix:${subject?.id ?? isoBirth}:${operationId}`]);
    operationIntent = claimed.rows[0] ?? (await query<MatrixOperationIntent>(`SELECT input, session_id, status, billing_required,
      created_at < NOW() - INTERVAL '30 minutes' AS expired FROM bot_matrix_operations
      WHERE user_id = $1 AND operation_id = $2`, [profileUserId, operationId])).rows[0];
    if (!operationIntent) throw new Error("matrix_operation_claim_missing");
    freeClaimed = Boolean(claimed.rows[0] && !operationIntent.billing_required);
    freeReplay = !claimed.rows[0] && !operationIntent.billing_required;
  }
  if (operationIntent && (operationIntent.input.subjectId !== operationInput.subjectId || operationIntent.input.toolId !== toolId)) {
    return { ok: false, error: "operation_failed", message: "Номер запроса принадлежит другой матрице. Подтвердите новый расчёт." };
  }
  if (operationIntent?.status === "failed") {
    return { ok: false, error: "operation_failed", message: "Этот запрос завершился без результата. Подтвердите новый расчёт." };
  }
  if (operationIntent.billing_required && operationIntent.input.birthDate !== isoBirth) {
    const priorSpend = await query(`SELECT id FROM rune_transactions WHERE user_id = $1
      AND type = 'spend' AND idempotency_key = $2 LIMIT 1`,
    [profileUserId, `tg-matrix:${subject?.id ?? isoBirth}:${operationId}`]);
    if (!priorSpend.rows[0]) {
      return { ok: false, error: "operation_failed", message: "Дата рождения изменилась после подтверждения. Подтвердите новый расчёт; руны не списаны." };
    }
  }
  if (operationIntent.billing_required) {
    try {
      billingCharge = await BillingService.chargeForSession({
        userId: profileUserId,
        cost: tool.cost,
        actionType: chargeAction,
        description: `${subject?.kind === "child" ? "Детская" : "Полная"} матрица — разбор Эвелины`,
        idempotencyKey: `tg-matrix:${subject?.id ?? isoBirth}:${operationId}`,
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
  if (billingCharge?.deduplicated || freeReplay) {
    const refund = billingCharge ? await query(`SELECT id FROM rune_transactions WHERE user_id = $1
      AND type = 'refund' AND refund_of_transaction_id = $2 LIMIT 1`, [profileUserId, billingCharge.transactionId])
      : { rows: [] };
    if (refund.rows[0]) {
      return { ok: false, error: "operation_failed", refunded: true,
        message: "Этот расчёт завершился ошибкой; руны возвращены. Новый расчёт можно подтвердить в меню матрицы." };
    }
    // A replacement retry must resolve its own receipt, never an older report
    // belonging to the same subject while the replacement is still running.
    const receipt = await query<{
      id: string; content: string; sessionId: string | null; birthDate: string;
      structuredData: Record<string, unknown> | null; calculationVersion: string; createdAt: string;
    }>(`SELECT id, content, session_id AS "sessionId", birth_date::text AS "birthDate",
        structured_data AS "structuredData", calculation_version AS "calculationVersion", created_at::text AS "createdAt"
      FROM numerology_report_history
      WHERE user_id = $1 AND ${billingCharge ? "charge_transaction_id = $2" : "session_id = $2::uuid"} AND tool_id = $3
        AND subject_id IS NOT DISTINCT FROM $4::uuid LIMIT 1`,
      [profileUserId, billingCharge?.transactionId ?? operationIntent?.session_id ?? null, toolId, subject?.id ?? null]);
    // Read receipt and content in one statement: a concurrent same-version
    // replacement can change the report row between two separate reads.
    const ownedAgain = receipt.rows[0] ?? null;
    const boundSessionId = billingCharge ? await findSessionIdForBotCharge(billingCharge.transactionId) : operationIntent?.session_id;
    const original = boundSessionId ? await query<{
      content: string | null;
      receipt: { birthDate?: string; subjectName?: string; subjectIdentity?: typeof subjectIdentity;
        structuredData?: Record<string, unknown>; calculationVersion?: string; createdAt?: string } | null;
    }>(`SELECT s.numerolog_tool_params->'botMatrixReceipt' AS receipt,
        COALESCE(s.numerolog_tool_params->'botMatrixReceipt'->>'content', (SELECT cm.content FROM chat_messages cm WHERE cm.session_id = s.id
          AND cm.role = 'assistant' AND cm.character_id = 'numerolog'
          AND (cm.owner_user_id = $2 OR cm.owner_user_id IS NULL)
          AND length(trim(cm.content)) > 0 ORDER BY cm.created_at ASC, cm.id ASC LIMIT 1)) AS content
      FROM sessions s WHERE s.id = $1 AND s.user_id = $2 AND s.character_key = 'numerolog'`,
    [boundSessionId, profileUserId]) : null;
    const saved = original?.rows[0];
    const frozen = saved?.receipt;
    if (ownedAgain?.content?.trim() && isUsableMatrixReading(ownedAgain.content, toolId)) {
      const sessionId = ownedAgain.sessionId?.trim() || boundSessionId || "";
      const safeOwned = sanitizeReadingForClient(ownedAgain.content) || ownedAgain.content;
      return {
        ok: true,
        action: "run",
        reportId: ownedAgain.id,
        ...(frozen?.subjectIdentity ?? { ...subjectIdentity,
          subject: subjectIdentity.subject ? { ...subjectIdentity.subject, birthDate: ownedAgain.birthDate } : null }),
        operationId,
        sessionId,
        content: safeOwned,
        birthDate: ownedAgain.birthDate,
        runeBalance,
        charged: 0,
        reused: true,
        replaced: false,
        diagram: diagramForSavedReport(ownedAgain, frozen?.subjectName ?? subjectName),
        url: `${siteBase()}/?chat_session=${encodeURIComponent(sessionId)}&utm_source=telegram&utm_medium=bot&utm_campaign=matrix`,
      };
    }
    if (boundSessionId) {
      if (saved?.content?.trim() && isUsableMatrixReading(saved.content, toolId)) {
        const originalDiagram = frozen?.structuredData && frozen.birthDate && frozen.calculationVersion && frozen.createdAt
          ? diagramForSavedReport({ birthDate: frozen.birthDate, structuredData: frozen.structuredData,
              calculationVersion: frozen.calculationVersion, createdAt: frozen.createdAt }, frozen.subjectName)
          : null;
        return {
          ok: true, action: "run", reportId: "", ...(frozen?.subjectIdentity ?? subjectIdentity), operationId,
          sessionId: boundSessionId, content: sanitizeReadingForClient(saved.content) || saved.content,
          birthDate: frozen?.birthDate ?? isoBirth, runeBalance, charged: 0, reused: true, replaced: false,
          diagram: originalDiagram, diagramUnavailable: !originalDiagram,
          message: originalDiagram ? undefined : "Прежний текст восстановлен. Исходная схема этого разбора недоступна.",
          url: `${siteBase()}/?chat_session=${encodeURIComponent(boundSessionId)}&utm_source=telegram&utm_medium=bot&utm_campaign=matrix`,
        };
      }
    }
    const age = billingCharge ? await query<{ expired: boolean }>(`SELECT created_at < NOW() - INTERVAL '30 minutes' AS expired
      FROM rune_transactions WHERE id = $1 AND user_id = $2 AND type = 'spend'`,
    [billingCharge.transactionId, profileUserId]) : { rows: [{ expired: operationIntent?.expired ?? false }] };
    if (age.rows[0]?.expired) {
      return { ok: false, error: "not_available", message: "Исходный результат этого запроса недоступен. Повторная проверка не списала руны. Обратитесь в поддержку с номером операции." };
    }
    return {
      ok: true,
      action: "run",
      reportId: ownedAgain?.id ?? "",
      ...subjectIdentity,
      operationId,
      sessionId: boundSessionId ?? "",
      content: "",
      pending: true,
      birthDate: isoBirth,
      runeBalance,
      charged: 0,
      reused: true,
      replaced: false,
      diagram: ownedAgain
        ? diagramForSavedReport(ownedAgain, subjectName)
        : buildLiveMatrixDiagram(isoBirth, subjectName),
      message: "Операция принята ранее. Готовый результат ещё не подтверждён; повторная проверка не спишет руны.",
      url: `${siteBase()}/cabinet?utm_source=telegram&utm_medium=bot&utm_campaign=matrix`,
    };
  }

  let persisted: Awaited<ReturnType<typeof saveMatrixReport>> | null = null;
  let resultSessionId = "";
  try {
  // Cleanup belongs only to a newly accepted generation. A replay must retain
  // its original session even when the current mutable report is unusable.
  if (regenerateAfterLeak && owned) {
    const subjectForWipe = subject ?? (await ensureSelfSubject(profileUserId));
    const wiped = subjectForWipe?.id
      ? await deleteOwnedMatrixReportsForSubject(profileUserId, subjectForWipe.id, {
          toolId,
          calculationVersion: owned.calculationVersion,
        })
      : await deleteOwnedMatrixReportsForBirth(profileUserId, isoBirth, {
          calculationVersion: owned.calculationVersion,
        });
    await purgeMatrixConsultationSessions(profileUserId, wiped.sessionIds);
  }
  const session = await createSession(undefined, profileUserId);
  resultSessionId = session.id;
  await bindBotChargeSession(billingCharge?.transactionId, session.id);
  if (freeClaimed) {
    const bound = await query(`UPDATE bot_matrix_operations SET session_id = $3
      WHERE user_id = $1 AND operation_id = $2 AND session_id IS NULL`, [profileUserId, operationId, session.id]);
    if (bound.rowCount !== 1) throw new Error("matrix_operation_bind_failed");
  }
  await updateSessionChatMeta(session.id, {
    characterKey: "numerolog",
    intention: "destiny_matrix",
    spreadType: "new",
    spreadId: "destiny_matrix",
    cards: [],
  });

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

    const ownedSnap = await ensureOwnedMatrixSnapshot({
      userId: profileUserId,
      birthDate,
      displayName: subjectName,
      subjectKind: subject?.kind ?? "self",
      subjectId: subject?.id,
    });
    // Preserve the original diagram and subject alongside the charge-bound
    // session; a later replacement updates the mutable report archive row.
    await query(`UPDATE sessions SET numerolog_tool_params = COALESCE(numerolog_tool_params, '{}'::jsonb)
      || jsonb_build_object('botMatrixReceipt', $3::jsonb) WHERE id = $1 AND user_id = $2`,
    [session.id, profileUserId, JSON.stringify({ birthDate: isoBirth, subjectName, subjectIdentity,
      structuredData: ownedSnap.snapshot, calculationVersion: ownedSnap.calculationVersion ?? MATRIX_CALCULATION_VERSION,
      createdAt: ownedSnap.asOfDate })]);
    const sessionResult = await generateNumerologSessionReading({
      toolId,
      userName: readerName,
      birthDate,
      fullName: readerName,
      gender: gate.user.gender,
      spreadNumbers: [],
      memoryBlock: numerologMemoryBlock,
      birthTime: subject?.kind && subject.kind !== "self" ? undefined : gate.user.birth_time,
      birthCity: subject?.kind && subject.kind !== "self" ? undefined : gate.user.birth_city,
      userId: profileUserId,
      subjectKind: subject?.kind ?? "self",
      subjectName,
      asOfDate: ownedSnap.asOfDate,
      matrixSnapshot: ownedSnap.snapshot,
    });
    const rawReading = sessionResult.reply?.trim() || "";
    let reading = sanitizeReadingForClient(rawReading) || rawReading;
    const matrix = resolveMatrixForEngine({
      birthDate,
      snapshot: ownedSnap.snapshot,
      asOfDate: ownedSnap.asOfDate,
    });
    if (matrix && (!isUsableMatrixReading(reading, toolId) || !reading.trim())) {
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
    if (!isUsableMatrixReading(reading, toolId) || !reading.trim()) {
      throw new Error("matrix_prompt_leak_or_empty");
    }
    await query(`UPDATE sessions SET numerolog_tool_params = jsonb_set(numerolog_tool_params,
      '{botMatrixReceipt,content}', to_jsonb($3::text)) WHERE id = $1 AND user_id = $2`,
    [session.id, profileUserId, reading]);
    const { matrixReadingToStructuredPayload } = await import(
      "@/lib/numerology/matrix-reading-document"
    );
    const structuredBase = matrix
      ? matrixToStructuredData(matrix)
      : { version: MATRIX_CALCULATION_VERSION };
    const saved = await saveMatrixReport({
      userId: profileUserId,
      toolId,
      birthDateRaw: birthDate,
      content: reading,
      runeCost: charged,
      chargeTransactionId: billingCharge?.transactionId,
      sessionId: session.id,
      structuredData: {
        ...structuredBase,
        ...(sessionResult.matrixDocument
          ? { reading: matrixReadingToStructuredPayload(sessionResult.matrixDocument) }
          : {}),
      },
      subjectId: subject?.id,
      // Overwrite is scoped to this calculation_version — older purchased rows stay.
      overwrite: replace || regenerateAfterLeak,
    });
    persisted = saved;

    if (saved.status === "already_saved") {
      reading = saved.report.content;
      if (billingCharge) {
        const rollback = await BillingService.rollbackChargeEx({
          userId: profileUserId,
          cost: billingCharge.spentRunes,
          wasFreeQuestion: false,
          actionType: chargeAction,
          transactionId: billingCharge.transactionId,
        });
        runeBalance = rollback.balance;
        if (rollback.refunded) {
          charged = 0;
          billingCharge = null;
        }
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
      ...subjectIdentity,
      operationId,
      sessionId: session.id,
      content: reading,
      birthDate: isoBirth,
      runeBalance,
      charged,
      reused: saved.status === "already_saved",
      replaced: replace || saved.status === "updated",
      diagram: diagramForSavedReport(saved.report, subjectName),
      url: `${siteBase()}/?chat_session=${encodeURIComponent(session.id)}&utm_source=telegram&utm_medium=bot&utm_campaign=matrix`,
    };
  } catch (err) {
    console.error("[bot-matrix] run failed", err);
    // Once the owned report is durable, chat/history delivery cannot turn a
    // successful paid purchase into a refund or a second generation.
    if (persisted) {
      return {
        ok: true, action: "run", reportId: persisted.report.id, ...subjectIdentity, operationId,
        sessionId: resultSessionId, content: sanitizeReadingForClient(persisted.report.content) || persisted.report.content,
        birthDate: isoBirth, runeBalance, charged, reused: persisted.status === "already_saved",
        replaced: replace || persisted.status === "updated", diagram: diagramForSavedReport(persisted.report, subjectName),
        url: `${siteBase()}/cabinet?utm_source=telegram&utm_medium=bot&utm_campaign=matrix`,
      };
    }
    let refunded = false;
    if (freeClaimed) {
      await query(`UPDATE bot_matrix_operations SET status = 'failed' WHERE user_id = $1 AND operation_id = $2`,
        [profileUserId, operationId]);
    }
    if (billingCharge) {
      try {
        const rollback = await BillingService.rollbackChargeEx({
          userId: profileUserId,
          cost: billingCharge.spentRunes,
          wasFreeQuestion: false,
          actionType: chargeAction,
          transactionId: billingCharge.transactionId,
        });
        refunded = rollback.refunded;
      } catch {
        /* ignore */
      }
    }
    return {
      ok: false,
      error: "internal",
      refunded,
      message: refunded ? "Разбор не сложился. Руны возвращены; новый расчёт можно подтвердить в меню матрицы."
        : charged > 0 ? "Не удалось завершить расчёт. Возврат рун пока не подтверждён — проверьте баланс в профиле."
        : "Разбор не сложился. Руны не списаны — попробуйте ещё раз.",
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
  operationId?: string;
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
      return botMatrixRun(input.telegramUserId, { replace: input.replace, subjectId: input.subjectId, operationId: input.operationId });
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
