import { query, queryClient, withTransaction } from "@/lib/db";
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
    description: "30 дней в приложении",
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
  currentStreak: number;
  daysTotal: number;
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

  return {
    totalMessages,
    sessionsWithMaster,
    currentStreak: streak,
    daysTotal: days.length,
  };
}

function checkAchievement(
  key: AchievementKey,
  stats: UserStats,
  message: string
): boolean {
  switch (key) {
    case "first_message":
      return stats.totalMessages === 1;
    case "week_streak":
      return stats.currentStreak >= 7;
    case "loyal_master":
      return stats.sessionsWithMaster >= 10;
    case "brave_question":
      return BRAVE_RE.test(message);
    case "month_in":
      return stats.daysTotal >= 30;
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

async function grantAchievement(
  userId: string,
  key: AchievementKey,
  ach: (typeof ACHIEVEMENTS)[AchievementKey]
): Promise<boolean> {
  try {
    return await withTransaction(async (client) => {
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
    const { rows: existing } = await query<{ id: string }>(
      `SELECT id FROM user_achievements WHERE user_id = $1 AND achievement = $2`,
      [userId, key]
    );
    if (existing[0]) continue;

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
