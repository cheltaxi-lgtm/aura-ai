import { query, queryClient, withTransaction, type PoolClient } from "@/lib/db";
import { ensureStarterGrantMarker } from "@/lib/rune-service";
import { getDaysWithUs } from "@/lib/user-lifetime-stats";
import type { CharacterKey } from "@/lib/prompts/types";
export const ACHIEVEMENTS = {
  first_message: {
    label: "Первый шаг",
    description: "Первое сообщение мастеру",
    bonus: 10,
    phrase: {
      ragnar: "Первый шаг сделан. Норны смотрят.",
      agafya: "Пришла. Уже хорошо.",
      veronika: "Ты здесь. Карты открываются.",
      "shri-raj": "Путь начат. Это главное.",
      numerolog: "Первый шаг в коде судьбы. Цифры уже смотрят.",
    },
  },
  week_streak: {
    label: "Искатель",
    description: "7 дней подряд в приложении",
    bonus: 25,
    phrase: {
      ragnar: "Семь рассветов подряд. Норны замечают упорных.",
      agafya: "Семь дней ходишь... Уважаю.",
      veronika: "Семь дней. Карты начинают узнавать тебя.",
      "shri-raj": "Семь дней — первый цикл. Шани доволен.",
      numerolog: "Семь дней подряд — цикл начал читаться.",
    },
  },
  loyal_master: {
    label: "Доверенный",
    description: "10 сеансов с одним мастером",
    bonus: 20,
    phrase: {
      ragnar: "Десять раз вернулся. Это не случайно.",
      agafya: "Десять раз пришла. Значит доверяешь.",
      veronika: "Десять встреч. Карты тебя уже знают.",
      "shri-raj": "Десять сеансов — это уже путь.",
      numerolog: "Десять раз вернулась — числа тебя узнали.",
    },
  },
  brave_question: {
    label: "Смелый",
    description: "Спросил о сложном",
    bonus: 10,
    phrase: {
      ragnar: "Спрашиваешь о тяжёлом. Это требует силы.",
      agafya: "Не побоялась спросить. Правильно.",
      veronika: "Смелый вопрос — честный ответ.",
      "shri-raj": "Смелость спросить — начало мудрости.",
      numerolog: "Смелый вопрос — честное число в ответе.",
    },
  },
  month_in: {
    label: "Постоянный",
    description: "30 дней с нами в приложении",
    bonus: 50,
    phrase: {
      ragnar: "Тридцать дней. Ты часть этого пути.",
      agafya: "Месяц уже... Родной человек стал.",
      veronika: "Тридцать дней. Это уже не случайность.",
      "shri-raj": "Месяц пути. Карма меняется.",
      numerolog: "Месяц в коде — ты уже не случайный гость.",
    },
  },
} as const;

export type AchievementKey = keyof typeof ACHIEVEMENTS;

const BRAVE_RE =
  /смерт|болезн|порч|измен|враг|развод|умер|умрёт|сглаз|проклят/i;

export interface UserStats {
  totalMessages: number;
  sessionsWithMaster: number;
  maxSessionsOneMaster: number;
  currentStreak: number;
  daysTotal: number;
  daysWithUs: number;
}

async function getMaxSessionsWithOneMaster(userId: string): Promise<number> {
  const { rows } = await query<{ cnt: string }>(
    `SELECT MAX(c)::text AS cnt FROM (
       SELECT COUNT(*) AS c FROM session_memories
       WHERE user_id = $1 GROUP BY character_key
     ) sub`,
    [userId]
  );
  return Number.parseInt(rows[0]?.cnt ?? "0", 10);
}

export async function getUserStats(
  userId: string,
  characterKey: string
): Promise<UserStats> {
  const { rows: msgRows } = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM chat_messages cm
     JOIN sessions s ON s.id = cm.session_id
     WHERE cm.role = 'user' AND (cm.owner_user_id = $1 OR s.user_id = $1)`,
    [userId]
  );

  const { rows: masterRows } = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM chat_messages cm
     JOIN sessions s ON s.id = cm.session_id
     WHERE cm.role = 'user' AND cm.character_id = $2
       AND (cm.owner_user_id = $1 OR s.user_id = $1)`,
    [userId, characterKey]
  );

  const { rows: dayRows } = await query<{ d: string }>(
    `SELECT DISTINCT DATE(cm.created_at) AS d FROM chat_messages cm
     JOIN sessions s ON s.id = cm.session_id
     WHERE cm.role = 'user' AND (cm.owner_user_id = $1 OR s.user_id = $1)
     ORDER BY d DESC`,
    [userId]
  );

  const days = dayRows.map((r) => r.d);
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < days.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    const expectedStr = expected.toISOString().slice(0, 10);
    if (days[i] === expectedStr) streak++;
    else break;
  }

  const totalMessages = Number(msgRows[0]?.cnt ?? 0);
  const sessionsWithMaster = Math.floor(Number(masterRows[0]?.cnt ?? 0) / 3);
  const maxSessionsOneMaster = await getMaxSessionsWithOneMaster(userId);
  const daysWithUs = await getDaysWithUs(userId);

  return {
    totalMessages,
    sessionsWithMaster,
    maxSessionsOneMaster,
    currentStreak: streak,
    daysTotal: days.length,
    daysWithUs,
  };
}

function checkAchievement(
  key: AchievementKey,
  stats: UserStats,
  message: string
): boolean {
  switch (key) {
    case "first_message":
      return stats.totalMessages >= 1;
    case "week_streak":
      return stats.currentStreak >= 7;
    case "loyal_master":
      return stats.maxSessionsOneMaster >= 10;
    case "brave_question":
      return BRAVE_RE.test(message);
    case "month_in":
      return stats.daysWithUs >= 30;
    default:
      return false;
  }
}

export interface AchievementEarned {
  achievement: AchievementKey;
  label: string;
  description: string;
  bonus: number;
  phrase: string;
}

async function runQuery<T extends { [key: string]: unknown }>(
  client: PoolClient | undefined,
  text: string,
  params?: unknown[]
) {
  if (client) return queryClient<T>(client, text, params);
  return query<T>(text, params);
}

/** True if this one-time achievement was ever credited or recorded. */
async function hasAchievementBeenGranted(
  userId: string,
  key: AchievementKey,
  client?: PoolClient
): Promise<boolean> {
  const { rows: existing } = await runQuery<{ id: string }>(
    client,
    `SELECT id FROM user_achievements WHERE user_id = $1 AND achievement = $2`,
    [userId, key]
  );
  if (existing[0]) return true;

  const label = ACHIEVEMENTS[key].label;
  const { rows: paid } = await runQuery<{ id: string }>(
    client,
    `SELECT id FROM rune_transactions
     WHERE user_id = $1
       AND type IN ('achievement', 'bonus')
       AND (
         action_type = $2
         OR description LIKE 'Достижение:%' || $3 || '%'
       )
     LIMIT 1`,
    [userId, key, label]
  );
  return Boolean(paid[0]);
}

/** Restore user_achievements row from ledger without crediting runes again. */
async function ensureAchievementRowFromLedger(
  userId: string,
  key: AchievementKey,
  client?: PoolClient
): Promise<boolean> {
  if (await hasAchievementBeenGranted(userId, key, client)) {
    const { rows: existing } = await runQuery<{ id: string }>(
      client,
      `SELECT id FROM user_achievements WHERE user_id = $1 AND achievement = $2`,
      [userId, key]
    );
    if (existing[0]) return true;

    const label = ACHIEVEMENTS[key].label;
    const { rows: paid } = await runQuery<{ earned_at: Date }>(
      client,
      `SELECT MIN(created_at) AS earned_at FROM rune_transactions
       WHERE user_id = $1
         AND type IN ('achievement', 'bonus')
         AND (
           action_type = $2
           OR description LIKE 'Достижение:%' || $3 || '%'
         )`,
      [userId, key, label]
    );
    if (!paid[0]?.earned_at) return false;

    await runQuery(
      client,
      `INSERT INTO user_achievements (user_id, achievement, earned_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, achievement) DO NOTHING`,
      [userId, key, paid[0].earned_at]
    );
    return true;
  }

  return false;
}

/** Sync achievement markers from ledger — never credits runes. Safe after cabinet purge. */
export async function syncAchievementGrantsFromLedger(
  userId: string,
  client?: PoolClient
): Promise<void> {
  for (const key of Object.keys(ACHIEVEMENTS) as AchievementKey[]) {
    await ensureAchievementRowFromLedger(userId, key, client);
  }
}

/** Keep one-time grants after activity purge (achievements + starter flag). */
export async function preservePermanentGrants(
  userId: string,
  client?: PoolClient
): Promise<void> {
  await syncAchievementGrantsFromLedger(userId, client);
  await ensureStarterGrantMarker(userId, client);
}

async function grantAchievement(
  userId: string,
  key: AchievementKey,
  ach: (typeof ACHIEVEMENTS)[AchievementKey]
): Promise<boolean> {
  try {
    return await withTransaction(async (client) => {
      // Serialize per-user grants — parallel chat/cabinet requests used to double-credit.
      await queryClient(client, `SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);

      const { rows: existing } = await queryClient<{ id: string }>(
        client,
        `SELECT id FROM user_achievements WHERE user_id = $1 AND achievement = $2`,
        [userId, key]
      );
      if (existing[0]) return false;

      if (await hasAchievementBeenGranted(userId, key, client)) {
        await ensureAchievementRowFromLedger(userId, key, client);
        return false;
      }

      const { rows: inserted } = await queryClient<{ id: string }>(
        client,
        `INSERT INTO user_achievements (user_id, achievement)
         VALUES ($1, $2)
         ON CONFLICT (user_id, achievement) DO NOTHING
         RETURNING id`,
        [userId, key]
      );
      if (!inserted[0]) return false;

      const { rows: updated } = await queryClient<{ rune_balance: number }>(
        client,
        `UPDATE users
         SET rune_balance = rune_balance + $2
         WHERE id = $1
         RETURNING rune_balance`,
        [userId, ach.bonus]
      );
      if (!updated[0]) throw new Error("user_not_found");

      await queryClient(
        client,
        `INSERT INTO rune_transactions
           (user_id, type, amount, balance_after, description, action_type)
         VALUES ($1, 'achievement', $2, $3, $4, $5)`,
        [userId, ach.bonus, updated[0].rune_balance, `Достижение: ${ach.label}`, key]
      );

      return true;
    });
  } catch (err) {
    console.error("grantAchievement failed:", err);
    return false;
  }
}

export async function checkAchievements(
  userId: string,
  characterKey: string,
  message: string
): Promise<AchievementEarned | null> {
  const stats = await getUserStats(userId, characterKey);
  const charKey = (characterKey in ACHIEVEMENTS.first_message.phrase
    ? characterKey
    : "ragnar") as CharacterKey;

  for (const key of Object.keys(ACHIEVEMENTS) as AchievementKey[]) {
    if (await hasAchievementBeenGranted(userId, key)) continue;

    if (!checkAchievement(key, stats, message)) continue;

    const ach = ACHIEVEMENTS[key];
    const granted = await grantAchievement(userId, key, ach);
    if (!granted) continue;

    return {
      achievement: key,
      label: ach.label,
      description: ach.description,
      bonus: ach.bonus,
      phrase: ach.phrase[charKey as keyof typeof ach.phrase] ?? ach.phrase.ragnar,
    };
  }

  return null;
}

/** Grant numeric achievements that were earned before checks ran (cabinet refresh). */
export async function syncRetroactiveAchievements(userId: string): Promise<void> {
  await syncAchievementGrantsFromLedger(userId);

  const stats = await getUserStats(userId, "veronika");

  for (const key of Object.keys(ACHIEVEMENTS) as AchievementKey[]) {
    if (key === "brave_question") continue;
    if (await hasAchievementBeenGranted(userId, key)) continue;
    if (!checkAchievement(key, stats, "")) continue;

    await grantAchievement(userId, key, ACHIEVEMENTS[key]);
  }
}
