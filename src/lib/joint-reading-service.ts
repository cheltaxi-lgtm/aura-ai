import { randomBytes } from "crypto";
import { query } from "@/lib/db";
import { generateReading } from "@/lib/chat-prompts";
import { dispatchNotification } from "@/lib/notify";
import { normalizeSpreadId, type SpreadId } from "@/lib/spreads";
import {
  sendEmail,
  jointReadingCompletedEmailHtml,
  jointReadingPartnerDoneEmailHtml,
} from "@/lib/email/send";

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
  rune_charged: boolean;
  expires_at: string;
  created_at: string;
  completed_at: string | null;
}

export type JointSubmitResult =
  | { ok: true; row: JointReadingRow; alreadySaved?: boolean }
  | { ok: false; error: string; row?: JointReadingRow };

function generateToken(): string {
  return randomBytes(8).toString("base64url").slice(0, 10);
}

function normalizePersonName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lenient match for the partner name entered at invite creation vs. the
 * profile name of whoever claims the partner slot — people commonly use
 * nicknames, only a first name, or a different name order.
 */
function namesLikelyMatch(expected: string, claim: string): boolean {
  const expectedNorm = normalizePersonName(expected);
  const claimNorm = normalizePersonName(claim);
  if (!expectedNorm || !claimNorm) return true;
  if (expectedNorm === claimNorm) return true;
  if (claimNorm.includes(expectedNorm) || expectedNorm.includes(claimNorm)) return true;
  const expectedFirst = expectedNorm.split(" ")[0];
  const claimFirst = claimNorm.split(" ")[0];
  return Boolean(expectedFirst && claimFirst && expectedFirst === claimFirst);
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
    rune_charged: Boolean(row.rune_charged),
    expires_at: String(row.expires_at),
    created_at: String(row.created_at),
    completed_at: row.completed_at ? String(row.completed_at) : null,
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
async function notifyJointReadingEvent(params: {
  userId: string;
  type: "joint_reading_partner_done" | "joint_reading_completed";
  token: string;
}): Promise<void> {
  const isCompleted = params.type === "joint_reading_completed";
  const title = isCompleted ? "Совместный расклад готов" : "Партнёр завершил расклад";
  const body = isCompleted
    ? "Оба расклада собраны — откройте общую интерпретацию пары."
    : "Ваш партнёр прошёл свою часть совместного расклада. Откройте результат.";
  const ctaLabel = isCompleted ? "Читать результат" : "Открыть результат";
  const ctaPath = `/joint-reading/${params.token}`;

  await dispatchNotification({
    userId: params.userId,
    type: params.type,
    title,
    body,
    ctaPath,
    ctaLabel,
    data: { token: params.token },
  });

  try {
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
    const existing = await getActiveJointInviteForInitiator(params.initiatorUserId);
    if (existing) {
      if (params.initiatorName || params.partnerName) {
        await query(
          `UPDATE joint_readings SET
             initiator_name = COALESCE($2, initiator_name),
             partner_name = COALESCE($3, partner_name)
           WHERE id = $1`,
          [
            existing.id,
            params.initiatorName?.trim().slice(0, 40) || null,
            params.partnerName?.trim().slice(0, 40) || null,
          ]
        );
        return (await getJointReadingByToken(existing.token)) ?? existing;
      }
      return existing;
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
  const claim = await query(
    `UPDATE joint_readings SET combined_reading = '' WHERE token = $1 AND combined_reading IS NULL`,
    [row.token]
  );
  if (!claim.rowCount) {
    return (await getJointReadingByToken(row.token)) ?? row;
  }

  try {
    const combined = await generateCombinedReading(row);
    await query(
      `UPDATE joint_readings SET combined_reading = $2, completed_at = COALESCE(completed_at, NOW()), status = 'completed' WHERE token = $1`,
      [row.token, combined]
    );
    return (await getJointReadingByToken(row.token)) ?? { ...row, combined_reading: combined, status: "completed" };
  } catch (err) {
    // Release the claim so a later request can retry instead of getting stuck forever.
    await query(
      `UPDATE joint_readings SET combined_reading = NULL WHERE token = $1 AND combined_reading = ''`,
      [row.token]
    );
    throw err;
  }
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
    const expectedPartner = existing.partner_name?.trim();
    const claimName = params.profileName?.trim();
    if (expectedPartner && claimName && !namesLikelyMatch(expectedPartner, claimName)) {
      return {
        ok: false,
        error: `Это приглашение для «${expectedPartner}». Войдите под аккаунтом партнёра или попросите новую ссылку.`,
      };
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
    updated = await ensureCombinedReading(updated);

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

async function generateCombinedReading(row: JointReadingRow): Promise<string> {
  const initiatorLabel = row.initiator_name?.trim() || "Инициатор";
  const partnerLabel = row.partner_name?.trim() || "Партнёр";
  try {
    const systemPrompt = `Ты — мастер таро Zovus. Составь единую интерпретацию СОВМЕСТНОГО расклада для двух людей на основе двух готовых текстов. Пиши по-русски, тепло, без markdown-заголовков.`;

    const userMessage = `${initiatorLabel} (инициатор):\n${row.initiator_reading ?? ""}\n\n${partnerLabel} (партнёр):\n${row.partner_reading ?? ""}\n\nСинтезируй: суть связи, сильные стороны, зоны напряжения, совет, перспектива.`;

    const generated = await generateReading(systemPrompt, {
      userName: initiatorLabel,
      tarotCards: [],
      isPaid: true,
      characterId: row.initiator_character ?? "veronika",
      userMessage,
    });
    if (generated.text?.trim()) return generated.text.trim();
  } catch {
    /* fallback below */
  }

  return [
    `Совместный расклад ${initiatorLabel} и ${partnerLabel}.`,
    "",
    row.initiator_reading ?? "",
    "",
    row.partner_reading ?? "",
    "",
    "Карты показывают, что у пары есть общий ресурс для сближения — обсудите выводы с мастером в чате.",
  ].join("\n");
}

export function buildJointReadingUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://zovus.ru";
  return `${base}/joint-reading/${token}`;
}
