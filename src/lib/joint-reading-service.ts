import { randomBytes, randomUUID } from "crypto";
import { query } from "@/lib/db";
import { generateReading } from "@/lib/chat-prompts";
import { dispatchNotification } from "@/lib/notify";
import { normalizeSpreadId, type SpreadId } from "@/lib/spreads";
import { resolveDeckCard, resolveDeckSystem } from "@/lib/deck-card-utils";
import { buildPaidSpreadReadingExtras } from "@/lib/prompts/premium-reading";
import { CARD_GROUNDED_READING_RULES } from "@/lib/prompts/format";
import {
  sendEmail,
  jointReadingCompletedEmailHtml,
  jointReadingPartnerDoneEmailHtml,
  jointReadingExpiringEmailHtml,
} from "@/lib/email/send";
import { stripEnglishLeakageFromRussianText } from "@/lib/reading-text-polish";
import { isNatalChartEnabled } from "@/lib/settings";
import { getOrComputeNatalChart } from "@/lib/services/natal-chart-service";
import { computeSynastry } from "@/lib/natal/synastry";
import { getNotificationPrefs } from "@/lib/daily-reminder-service";

export type JointReadingStatus = "pending_partner" | "partner_done" | "completed" | "expired";

export interface JointReadingRow {
  id: string;
  token: string;
  initiator_user_id: string;
  initiator_name: string | null;
  partner_name: string | null;
  spread_id: string;
  intent_slug: string;
  status: JointReadingStatus;
  initiator_session_id: string | null;
  initiator_reading: string | null;
  initiator_cards: { name: string; position?: string }[];
  initiator_character: string | null;
  partner_user_id: string | null;
  partner_session_id: string | null;
  partner_reading: string | null;
  partner_cards: { name: string; position?: string }[];
  partner_character: string | null;
  combined_reading: string | null;
  combined_claim_token: string | null;
  combined_claim_at: string | null;
  completion_notified_at: string | null;
  synastry_data: Record<string, unknown> | null;
  rune_charged: boolean;
  expires_at: string;
  created_at: string;
  completed_at: string | null;
  reminder_sent_at: string | null;
}

export type JointSubmitResult =
  | { ok: true; row: JointReadingRow; alreadySaved?: boolean }
  | { ok: false; error: string; row?: JointReadingRow };

function generateToken(): string {
  return randomBytes(16).toString("base64url");
}

function mapRow(row: Record<string, unknown>): JointReadingRow {
  return {
    id: String(row.id),
    token: String(row.token),
    initiator_user_id: String(row.initiator_user_id),
    initiator_name: row.initiator_name ? String(row.initiator_name) : null,
    partner_name: row.partner_name ? String(row.partner_name) : null,
    spread_id: String(row.spread_id),
    intent_slug: String(row.intent_slug),
    status: row.status as JointReadingStatus,
    initiator_session_id: row.initiator_session_id ? String(row.initiator_session_id) : null,
    initiator_reading: row.initiator_reading ? String(row.initiator_reading) : null,
    initiator_cards: Array.isArray(row.initiator_cards)
      ? (row.initiator_cards as JointReadingRow["initiator_cards"])
      : [],
    initiator_character: row.initiator_character ? String(row.initiator_character) : null,
    partner_user_id: row.partner_user_id ? String(row.partner_user_id) : null,
    partner_session_id: row.partner_session_id ? String(row.partner_session_id) : null,
    partner_reading: row.partner_reading ? String(row.partner_reading) : null,
    partner_cards: Array.isArray(row.partner_cards)
      ? (row.partner_cards as JointReadingRow["partner_cards"])
      : [],
    partner_character: row.partner_character ? String(row.partner_character) : null,
    combined_reading: row.combined_reading ? String(row.combined_reading) : null,
    combined_claim_token: row.combined_claim_token ? String(row.combined_claim_token) : null,
    combined_claim_at: row.combined_claim_at ? String(row.combined_claim_at) : null,
    completion_notified_at: row.completion_notified_at ? String(row.completion_notified_at) : null,
    synastry_data:
      row.synastry_data && typeof row.synastry_data === "object"
        ? (row.synastry_data as Record<string, unknown>)
        : null,
    rune_charged: Boolean(row.rune_charged),
    expires_at: String(row.expires_at),
    created_at: String(row.created_at),
    completed_at: row.completed_at ? String(row.completed_at) : null,
    reminder_sent_at: row.reminder_sent_at ? String(row.reminder_sent_at) : null,
  };
}

async function getProfileContact(userId: string): Promise<{ name: string; email: string | null }> {
  const res = await query<{ name: string | null; email: string | null }>(
    `SELECT u.name, ua.email
     FROM users u
     LEFT JOIN user_accounts ua ON ua.profile_user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );
  return { name: res.rows[0]?.name?.trim() || "друг", email: res.rows[0]?.email ?? null };
}

/** In-app notification + best-effort transactional email for a joint-reading milestone. */
export async function notifyJointReadingEvent(params: {
  userId: string;
  type: "joint_reading_partner_done" | "joint_reading_completed";
  token: string;
}): Promise<void> {
  const isCompleted = params.type === "joint_reading_completed";
  const title = isCompleted ? "Совместный расклад готов" : "Партнёр завершил расклад";
  const body = isCompleted
    ? "Оба расклада собраны — откройте общую интерпретацию."
    : "Ваш партнёр прошёл свою часть совместного расклада. Откройте результат.";
  const ctaLabel = isCompleted ? "Читать результат" : "Открыть результат";
  const ctaPath = `/joint-reading/${params.token}`;
  const prefs = await getNotificationPrefs(params.userId);

  if (prefs.dailyInApp) {
    await dispatchNotification({
      userId: params.userId,
      type: params.type,
      title,
      body,
      ctaPath,
      ctaLabel,
      data: { token: params.token },
    });
  }

  try {
    if (!prefs.dailyEmail) return;
    const { name, email } = await getProfileContact(params.userId);
    if (!email) return;
    const ctaUrl = buildJointReadingUrl(params.token);
    const html = isCompleted
      ? jointReadingCompletedEmailHtml(name, ctaUrl)
      : jointReadingPartnerDoneEmailHtml(name, ctaUrl);
    await sendEmail({
      to: email,
      subject: isCompleted ? "Zovus — совместный расклад готов" : "Zovus — партнёр завершил расклад",
      html,
      text: `${title}. ${body} ${ctaUrl}`,
      template: isCompleted ? "joint_reading_done" : "joint_reading_partner",
    });
  } catch (err) {
    console.warn("Joint reading email notification failed:", err);
  }
}

export function resolveJointParticipantRole(
  row: JointReadingRow,
  userId: string
): "initiator" | "partner" | null {
  if (userId === row.initiator_user_id) return "initiator";
  if (row.partner_user_id && userId === row.partner_user_id) return "partner";
  if (!row.partner_user_id && userId !== row.initiator_user_id) return "partner";
  return null;
}

export async function createJointReadingInvite(params: {
  initiatorUserId: string;
  initiatorName?: string;
  partnerName?: string;
  spreadId?: SpreadId;
  intentSlug?: string;
  reuseExisting?: boolean;
  runeCharged?: boolean;
}): Promise<JointReadingRow> {
  if (params.reuseExisting !== false) {
    const reconciled = await reconcileActiveJointInviteForCreation({
      userId: params.initiatorUserId,
      spreadId: params.spreadId ?? "love-7",
      intentSlug: params.intentSlug ?? "sovmestimost-pary",
      initiatorName: params.initiatorName,
      partnerName: params.partnerName,
    });
    if (reconciled.row && !reconciled.createFresh) {
      return reconciled.row;
    }
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateToken();
    try {
      const res = await query(
        `INSERT INTO joint_readings
           (token, initiator_user_id, initiator_name, partner_name, spread_id, intent_slug, expires_at, rune_charged)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          token,
          params.initiatorUserId,
          params.initiatorName?.trim().slice(0, 40) || null,
          params.partnerName?.trim().slice(0, 40) || null,
          params.spreadId ?? "love-7",
          params.intentSlug ?? "sovmestimost-pary",
          expiresAt.toISOString(),
          params.runeCharged ?? false,
        ]
      );
      return mapRow(res.rows[0] as Record<string, unknown>);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "23505") continue;
      throw err;
    }
  }
  throw new Error("Failed to generate joint reading token");
}

export async function getJointReadingByToken(token: string): Promise<JointReadingRow | null> {
  const res = await query(`SELECT * FROM joint_readings WHERE token = $1 LIMIT 1`, [token]);
  if (!res.rows[0]) return null;
  const row = mapRow(res.rows[0] as Record<string, unknown>);
  if (row.status !== "expired" && new Date(row.expires_at) < new Date()) {
    await query(`UPDATE joint_readings SET status = 'expired' WHERE id = $1`, [row.id]);
    return { ...row, status: "expired" };
  }
  return row;
}

export async function getActiveJointInviteForInitiator(
  userId: string
): Promise<JointReadingRow | null> {
  const res = await query(
    `SELECT * FROM joint_readings
     WHERE initiator_user_id = $1
       AND status IN ('pending_partner', 'partner_done')
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  if (!res.rows[0]) return null;
  return mapRow(res.rows[0] as Record<string, unknown>);
}

/** Whether an active invite can be retargeted to another spread/theme (no readings yet). */
export function jointInviteHasAnyReading(row: JointReadingRow): boolean {
  return Boolean(row.initiator_reading?.trim() || row.partner_reading?.trim());
}

/**
 * Reuse an active invite when settings match, retarget spread/theme when empty,
 * or signal that a fresh invite is needed (e.g. user picked 12 cards but old
 * invite already has a 3-card reading in progress).
 */
export async function reconcileActiveJointInviteForCreation(params: {
  userId: string;
  spreadId: SpreadId;
  intentSlug: string;
  initiatorName?: string;
  partnerName?: string;
}): Promise<{ row: JointReadingRow | null; createFresh: boolean; configUpdated: boolean }> {
  const existing = await getActiveJointInviteForInitiator(params.userId);
  if (!existing) {
    return { row: null, createFresh: true, configUpdated: false };
  }

  const nextSpread = normalizeSpreadId(params.spreadId);
  const currentSpread = normalizeSpreadId(existing.spread_id);
  const nextIntent = params.intentSlug.trim().slice(0, 80);
  const configChanged = nextSpread !== currentSpread || existing.intent_slug !== nextIntent;

  if (configChanged && jointInviteHasAnyReading(existing)) {
    return { row: null, createFresh: true, configUpdated: false };
  }

  const initiatorName = params.initiatorName?.trim().slice(0, 40) || null;
  const partnerName = params.partnerName?.trim().slice(0, 40) || null;

  if (configChanged) {
    await query(
      `UPDATE joint_readings SET
         spread_id = $2,
         intent_slug = $3,
         initiator_name = COALESCE($4, initiator_name),
         partner_name = COALESCE($5, partner_name)
       WHERE id = $1`,
      [existing.id, nextSpread, nextIntent, initiatorName, partnerName]
    );
  } else if (initiatorName || partnerName) {
    await query(
      `UPDATE joint_readings SET
         initiator_name = COALESCE($2, initiator_name),
         partner_name = COALESCE($3, partner_name)
       WHERE id = $1`,
      [existing.id, initiatorName, partnerName]
    );
  }

  const row = (await getJointReadingByToken(existing.token)) ?? existing;
  return { row, createFresh: false, configUpdated: configChanged };
}

export interface JointReadingAdminStats {
  total: number;
  byStatus: Record<JointReadingStatus, number>;
  completionRate: number;
}

export async function getJointReadingAdminStats(): Promise<JointReadingAdminStats> {
  const { rows } = await query<{ status: JointReadingStatus; count: string }>(
    `SELECT status, COUNT(*) AS count FROM joint_readings GROUP BY status`
  );
  const byStatus: Record<JointReadingStatus, number> = {
    pending_partner: 0,
    partner_done: 0,
    completed: 0,
    expired: 0,
  };
  let total = 0;
  for (const row of rows) {
    const count = Number(row.count) || 0;
    byStatus[row.status] = count;
    total += count;
  }
  const completionRate = total > 0 ? Math.round((byStatus.completed / total) * 1000) / 10 : 0;
  return { total, byStatus, completionRate };
}

export interface JointReadingAdminListItem {
  id: string;
  token: string;
  initiatorName: string | null;
  partnerName: string | null;
  intentSlug: string;
  status: JointReadingStatus;
  createdAt: string;
  expiresAt: string;
}

export async function listRecentJointReadingsForAdmin(
  limit = 30
): Promise<JointReadingAdminListItem[]> {
  const { rows } = await query<{
    id: string;
    token: string;
    initiator_name: string | null;
    partner_name: string | null;
    intent_slug: string;
    status: JointReadingStatus;
    created_at: string;
    expires_at: string;
  }>(
    `SELECT id, token, initiator_name, partner_name, intent_slug, status, created_at, expires_at
     FROM joint_readings
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((row) => ({
    id: row.id,
    token: row.token,
    initiatorName: row.initiator_name,
    partnerName: row.partner_name,
    intentSlug: row.intent_slug,
    status: row.status,
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
  }));
}

export async function listJointReadingsForUser(userId: string, limit = 20): Promise<JointReadingRow[]> {
  const res = await query(
    `SELECT * FROM joint_readings
     WHERE initiator_user_id = $1 OR partner_user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return res.rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function ensureCombinedReading(row: JointReadingRow): Promise<JointReadingRow> {
  if (row.combined_reading) return row;
  if (!row.initiator_reading?.trim() || !row.partner_reading?.trim()) return row;

  // Both sides poll this endpoint independently, so two requests can race here.
  // Atomically claim the generation slot first so we never call the LLM twice
  // (wasted cost) or clobber a result that already finished.
  const claimToken = randomUUID();
  const claim = await query(
    `UPDATE joint_readings
     SET combined_claim_token = $2, combined_claim_at = NOW()
     WHERE token = $1
       AND combined_reading IS NULL
       AND (combined_claim_token IS NULL OR combined_claim_at < NOW() - INTERVAL '10 minutes')`,
    [row.token, claimToken]
  );
  if (!claim.rowCount) {
    return (await getJointReadingByToken(row.token)) ?? row;
  }

  try {
    const synastry = await resolveJointSynastry(row);
    const combined = await generateCombinedReading(row, synastry);
    if (!combined?.trim()) {
      throw new Error("joint_combined_empty");
    }
    await query(
      `UPDATE joint_readings
       SET combined_reading = $2, synastry_data = $3::jsonb,
           completed_at = COALESCE(completed_at, NOW()), status = 'completed',
           combined_claim_token = NULL, combined_claim_at = NULL
       WHERE token = $1 AND combined_claim_token = $4`,
      [row.token, combined, synastry ? JSON.stringify(synastry) : null, claimToken]
    );
    return (await getJointReadingByToken(row.token)) ?? { ...row, combined_reading: combined, status: "completed" };
  } catch (err) {
    // Keep both side readings; do not persist concatenation stubs as combined success.
    await query(
      `UPDATE joint_readings SET combined_claim_token = NULL, combined_claim_at = NULL
       WHERE token = $1 AND combined_claim_token = $2`,
      [row.token, claimToken]
    );
    throw err;
  }
}

/** Atomically reserves the one completion-notification fanout for this reading. */
export async function claimJointCompletionNotification(token: string): Promise<boolean> {
  const result = await query(
    `UPDATE joint_readings SET completion_notified_at = NOW()
     WHERE token = $1 AND combined_reading IS NOT NULL AND completion_notified_at IS NULL`,
    [token]
  );
  return result.rowCount === 1;
}

export async function submitJointReadingSide(params: {
  token: string;
  userId: string;
  role: "initiator" | "partner";
  reading: string;
  cards: { name: string; position?: string }[];
  sessionId?: string;
  characterKey: string;
  profileName?: string | null;
}): Promise<JointSubmitResult> {
  const existing = await getJointReadingByToken(params.token);
  if (!existing || existing.status === "expired") {
    return { ok: false, error: "Приглашение не найдено или истекло." };
  }

  const isInitiator = params.role === "initiator";

  if (isInitiator) {
    if (existing.initiator_user_id !== params.userId) {
      return { ok: false, error: "Только инициатор может сохранить эту сторону." };
    }
    if (existing.initiator_reading?.trim()) {
      return { ok: true, row: existing, alreadySaved: true };
    }
  } else {
    if (params.userId === existing.initiator_user_id) {
      return { ok: false, error: "Инициатор не может пройти расклад как партнёр." };
    }
    if (existing.partner_user_id && existing.partner_user_id !== params.userId) {
      return { ok: false, error: "Слот партнёра уже занят другим аккаунтом." };
    }
    if (existing.partner_reading?.trim() && existing.partner_user_id === params.userId) {
      return { ok: true, row: existing, alreadySaved: true };
    }
  }

  if (isInitiator) {
    const initiatorUpdate = await query(
      `UPDATE joint_readings SET
         initiator_reading = $2,
         initiator_cards = $3,
         initiator_session_id = $4,
         initiator_character = $5,
         status = CASE WHEN partner_reading IS NOT NULL THEN 'completed' ELSE 'pending_partner' END
       WHERE token = $1 AND initiator_reading IS NULL`,
      [
        params.token,
        params.reading,
        JSON.stringify(params.cards),
        params.sessionId ?? null,
        params.characterKey,
      ]
    );
    if (!initiatorUpdate.rowCount) {
      // Lost a race against a concurrent submit from the same account — the
      // reading was already saved a moment ago, so report success without
      // pretending we just wrote this attempt's data.
      const latest = await getJointReadingByToken(params.token);
      return { ok: true, row: latest ?? existing, alreadySaved: true };
    }
  } else {
    const partnerUpdate = await query(
      `UPDATE joint_readings SET
         partner_user_id = COALESCE(partner_user_id, $2),
         partner_name = CASE
           WHEN partner_user_id IS NULL AND NULLIF($7, '') IS NOT NULL THEN $7
           ELSE partner_name
         END,
         partner_reading = $3,
         partner_cards = $4,
         partner_session_id = $5,
         partner_character = $6,
         status = CASE WHEN initiator_reading IS NOT NULL THEN 'completed' ELSE 'partner_done' END
       WHERE token = $1 AND partner_reading IS NULL`,
      [
        params.token,
        params.userId,
        params.reading,
        JSON.stringify(params.cards),
        params.sessionId ?? null,
        params.characterKey,
        params.profileName?.trim() ?? null,
      ]
    );
    if (!partnerUpdate.rowCount) {
      // Someone else won the race for the partner slot between our check above
      // and this write — don't report false success with their data.
      const latest = await getJointReadingByToken(params.token);
      return {
        ok: false,
        error: "Слот партнёра уже занят — кто-то другой сохранил расклад раньше вас.",
        row: latest ?? existing,
      };
    }

    if (existing.initiator_reading === null) {
      await notifyJointReadingEvent({
        userId: existing.initiator_user_id,
        type: "joint_reading_partner_done",
        token: params.token,
      });
    }
  }

  let updated = await getJointReadingByToken(params.token);
  if (!updated) return { ok: false, error: "Не удалось сохранить расклад." };

  if (
    updated.initiator_reading?.trim() &&
    updated.partner_reading?.trim() &&
    !updated.combined_reading
  ) {
    const { schedulePaidAsyncJob } = await import("@/lib/async-job-enqueue");
    const jobId = await schedulePaidAsyncJob({
      userId: updated.initiator_user_id,
      kind: "joint_combined",
      payload: { token: updated.token, async: false },
      bypassDeliveryGate: true,
    });
    if (!jobId) {
      // Worker unavailable: keep fail-closed sync path as last resort.
      try {
        updated = await ensureCombinedReading(updated);
        if (updated.combined_reading && (await claimJointCompletionNotification(params.token))) {
          await notifyJointReadingEvent({
            userId: updated.initiator_user_id,
            type: "joint_reading_completed",
            token: params.token,
          });
          if (updated.partner_user_id) {
            await notifyJointReadingEvent({
              userId: updated.partner_user_id,
              type: "joint_reading_completed",
              token: params.token,
            });
          }
        }
      } catch (err) {
        console.warn("[joint-reading] sync combined fallback failed:", err);
      }
    }
  }

  return { ok: true, row: updated };
}

export async function attachSpreadToJointReading(params: {
  jointToken: string;
  userId: string;
  profileName?: string | null;
  spreadId: SpreadId;
  reading: string;
  cards: { name: string; position?: string }[];
  sessionId?: string;
  characterKey: string;
}): Promise<JointSubmitResult> {
  const joint = await getJointReadingByToken(params.jointToken);
  if (!joint || joint.status === "expired") {
    return { ok: false, error: "Совместное приглашение не найдено или истекло." };
  }

  const expectedSpread = normalizeSpreadId(joint.spread_id);
  if (normalizeSpreadId(params.spreadId) !== expectedSpread) {
    return {
      ok: false,
      error: `Для этого приглашения нужен расклад «${expectedSpread}», а не «${params.spreadId}».`,
    };
  }

  const role = resolveJointParticipantRole(joint, params.userId);
  if (!role) {
    return { ok: false, error: "Вы не можете сохранить расклад в это приглашение." };
  }

  return submitJointReadingSide({
    token: params.jointToken,
    userId: params.userId,
    role,
    reading: params.reading,
    cards: params.cards,
    sessionId: params.sessionId,
    characterKey: params.characterKey,
    profileName: params.profileName,
  });
}

/** Relationship-flavoured framing for the LLM synthesis prompt, based on the invite's theme. */
function jointReadingRelationLabel(intentSlug: string): string {
  if (intentSlug === "sovmestimost-druzhba") return "друзья";
  if (intentSlug === "sovmestimost-biznes") return "бизнес-партнёры";
  return "пара";
}

function formatJointCardsForPrompt(
  cards: JointReadingRow["initiator_cards"] | JointReadingRow["partner_cards"],
  masterId?: string
): string {
  if (!cards?.length) return "—";
  const system = resolveDeckSystem(undefined, masterId ?? "veronika");
  return cards
    .map((card) => {
      const resolved = resolveDeckCard(system, { name: card.name });
      const pos = card.position?.trim() || "позиция";
      const meaning = resolved.shortMeaning || "";
      return meaning
        ? `${pos}: «${resolved.name}» — ${meaning}`
        : `${pos}: «${card.name}»`;
    })
    .join("; ");
}

function jointCardsToTarotCards(
  cards: JointReadingRow["initiator_cards"] | JointReadingRow["partner_cards"],
  masterId?: string
): { name: string; meaning: string; position?: string }[] {
  if (!cards?.length) return [];
  const system = resolveDeckSystem(undefined, masterId ?? "veronika");
  return cards.map((card) => {
    const resolved = resolveDeckCard(system, { name: card.name });
    return {
      name: resolved.name,
      meaning: resolved.shortMeaning || "",
      position: card.position,
    };
  });
}

function stripMarkdownForSynthesis(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function polishCombinedReading(text: string): string {
  let out = stripMarkdownForSynthesis(text);
  out = out.replace(/\(\s*\)/g, "");
  out = out.replace(/,\s*\./g, ".");
  out = out.replace(/\s+\./g, ".");
  out = out.replace(/\.{2,}/g, ".");
  out = out.replace(/…+/g, "…");

  const paragraphs = out
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const unique = paragraphs.filter((p) => {
    const key = p.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return stripEnglishLeakageFromRussianText(unique.join("\n\n"));
}

export async function resolveJointSynastry(row: JointReadingRow) {
  if (!(await isNatalChartEnabled())) return null;
  if (!row.partner_user_id) return null;

  const [chartA, chartB] = await Promise.all([
    getOrComputeNatalChart(row.initiator_user_id),
    getOrComputeNatalChart(row.partner_user_id),
  ]);
  if (!chartA || !chartB) return null;
  return computeSynastry(chartA, chartB, {
    a: row.initiator_name,
    b: row.partner_name,
  });
}

async function generateCombinedReading(
  row: JointReadingRow,
  synastry: Awaited<ReturnType<typeof resolveJointSynastry>> = null
): Promise<string> {
  const initiatorLabel = row.initiator_name?.trim() || "Инициатор";
  const partnerLabel = row.partner_name?.trim() || "Партнёр";
  const relation = jointReadingRelationLabel(row.intent_slug);
  const initiatorText = stripMarkdownForSynthesis(row.initiator_reading ?? "");
  const partnerText = stripMarkdownForSynthesis(row.partner_reading ?? "");

  try {
    const synastryBlock =
      synastry && synastry.highlights.length
        ? `\n\nДанные синастрии (расчёт движка, не выдумывай):\n- Балл: ${synastry.overallScore}\n${synastry.highlights.map((h) => `- ${h}`).join("\n")}`
        : "";

    const masterId = row.initiator_character ?? "veronika";
    const initiatorCards = jointCardsToTarotCards(row.initiator_cards, masterId);
    const partnerCards = jointCardsToTarotCards(row.partner_cards, masterId);
    const allCards = [...initiatorCards, ...partnerCards];
    const cardCount = Math.max(3, allCards.length || 3);

    const systemPrompt = `Ты — мастер таро Zovus. Составь единую интерпретацию СОВМЕСТНОГО расклада для двух людей (${relation}) на основе двух готовых текстов и карт обоих.${synastryBlock ? " Учти блок синастрии, если он есть." : ""}

${CARD_GROUNDED_READING_RULES}

${buildPaidSpreadReadingExtras({ cardCount, masterId, includeFinalConclusion: true })}

Правила синтеза:
- Пиши по-русски, тепло, связной прозой — премиальная глубина, не краткий пересказ.
- Без markdown, без заголовков, без списков и без «**».
- Не оставляй пустых скобок, обрывков вроде «твои .» или «()» — каждое предложение должно быть законченным.
- Не повторяй один и тот же абзац или мысль дважды.
- Не цитируй тексты дословно — синтезируй смысл обоих раскладов через карты.
- Не используй романтические формулировки, если это не пара — перед тобой ${relation}.
- Если символы показывают тень в союзе — называй прямо, без смягчения.
- Обязательно раскрой: суть связи, сильные стороны союза, зоны напряжения, практичный совет, перспектива, финальный вывод.`;

    const userMessage = [
      `${initiatorLabel} (инициатор), карты: ${formatJointCardsForPrompt(row.initiator_cards, masterId)}`,
      initiatorText,
      "",
      `${partnerLabel} (партнёр), карты: ${formatJointCardsForPrompt(row.partner_cards, masterId)}`,
      partnerText,
      "",
      `Синтезируй общую интерпретацию для ${initiatorLabel} и ${partnerLabel} как ${relation}. Опирайся на значения карт выше.`,
      synastryBlock,
    ]
      .filter(Boolean)
      .join("\n");

    const generated = await generateReading(systemPrompt, {
      userName: initiatorLabel,
      tarotCards: allCards.length ? allCards : [{ name: "Союз", meaning: "связь двух раскладов" }],
      isPaid: true,
      characterId: masterId,
      userMessage,
      intention: "love",
    });
    if (generated.fromLlm && generated.text?.trim()) {
      return polishCombinedReading(generated.text);
    }
    throw new Error("joint_combined_ai_failed");
  } catch (err) {
    console.warn("Joint reading combined synthesis failed (fail-closed):", err);
    throw err instanceof Error ? err : new Error("joint_combined_ai_failed");
  }
}

export function buildJointReadingUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://zovus.ru";
  return `${base}/joint-reading/${token}`;
}

export interface UserJointReadingAchievementStats {
  totalCompleted: number;
  maxWithOnePartner: number;
}

export async function getUserJointReadingAchievementStats(
  userId: string
): Promise<UserJointReadingAchievementStats> {
  const { rows: totalRows } = await query<{ c: string }>(
    `SELECT COUNT(*) AS c FROM joint_readings
     WHERE status = 'completed' AND (initiator_user_id = $1 OR partner_user_id = $1)`,
    [userId]
  );
  const { rows: partnerRows } = await query<{ max_c: string | null }>(
    `SELECT MAX(c) AS max_c FROM (
       SELECT COUNT(*) AS c
       FROM joint_readings
       WHERE status = 'completed' AND (initiator_user_id = $1 OR partner_user_id = $1)
       GROUP BY CASE WHEN initiator_user_id = $1 THEN partner_user_id ELSE initiator_user_id END
     ) sub`,
    [userId]
  );
  return {
    totalCompleted: Number(totalRows[0]?.c ?? 0),
    maxWithOnePartner: Number(partnerRows[0]?.max_c ?? 0),
  };
}

/**
 * Flips lazily-expired invites to status='expired' in bulk, instead of only on
 * next read of that specific token. Safe to call repeatedly (cron-driven).
 */
export async function sweepExpiredJointReadings(): Promise<number> {
  const res = await query(
    `UPDATE joint_readings
     SET status = 'expired'
     WHERE status IN ('pending_partner', 'partner_done') AND expires_at < NOW()`
  );
  return res.rowCount ?? 0;
}

/**
 * Nudges initiators whose invite is about to expire while the partner hasn't
 * even started — the only proactive reminder in the flow besides the static
 * "expires on {date}" footer. Each invite is reminded at most once.
 */
export async function sendExpiringJointReadingReminders(withinDays = 3): Promise<number> {
  const { rows } = await query(
    `SELECT * FROM joint_readings
     WHERE status = 'pending_partner'
       AND reminder_sent_at IS NULL
       AND expires_at > NOW()
       AND expires_at < NOW() + ($1 || ' days')::interval`,
    [withinDays]
  );

  let sent = 0;
  for (const raw of rows) {
    const row = mapRow(raw as Record<string, unknown>);
    try {
      const { name, email } = await getProfileContact(row.initiator_user_id);
      if (email) {
        const ctaUrl = buildJointReadingUrl(row.token);
        await sendEmail({
          to: email,
          subject: "Zovus — приглашение на совместный расклад скоро истечёт",
          html: jointReadingExpiringEmailHtml(name, ctaUrl),
          text: `Приглашение на совместный расклад скоро истечёт. Откройте: ${ctaUrl}`,
          template: "joint_reading_expiring",
        });
      }
      await dispatchNotification({
        userId: row.initiator_user_id,
        type: "joint_reading_expiring",
        title: "Приглашение скоро истечёт",
        body: "Партнёр ещё не прошёл совместный расклад — отправьте ему ссылку ещё раз.",
        ctaPath: `/joint-reading/${row.token}`,
        ctaLabel: "Открыть приглашение",
        data: { token: row.token },
      });
      sent += 1;
    } catch (err) {
      console.warn("Joint reading expiry reminder failed:", err);
    } finally {
      await query(`UPDATE joint_readings SET reminder_sent_at = NOW() WHERE id = $1`, [row.id]);
    }
  }
  return sent;
}
