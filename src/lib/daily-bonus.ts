import { query, withTransaction, queryClient } from "@/lib/db";
import { DAILY_BONUS_AMOUNT } from "@/lib/rune-daily-constants";

export { DAILY_BONUS_AMOUNT };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function formatNextBonusIn(msLeft: number): string {
  const safe = Math.max(0, msLeft);
  const hoursLeft = Math.floor(safe / (1000 * 60 * 60));
  const minutesLeft = Math.floor((safe % (1000 * 60 * 60)) / (1000 * 60));
  return `${hoursLeft}ч ${minutesLeft}м`;
}

function msUntilNextBonus(lastBonus: Date | null, now = new Date()): number | null {
  if (!lastBonus) return null;
  const elapsed = now.getTime() - lastBonus.getTime();
  if (elapsed >= MS_PER_DAY) return null;
  return MS_PER_DAY - elapsed;
}

export async function getDailyBonusStatus(profileUserId: string): Promise<{
  available: boolean;
  nextBonusIn?: string;
  currentBalance: number;
}> {
  const { rows } = await query<{ rune_balance: number; last_daily_bonus: Date | null }>(
    `SELECT rune_balance, last_daily_bonus FROM users WHERE id = $1`,
    [profileUserId]
  );
  const row = rows[0];
  if (!row) {
    return { available: false, currentBalance: 0 };
  }

  const lastBonus = row.last_daily_bonus ? new Date(row.last_daily_bonus) : null;
  const msLeft = msUntilNextBonus(lastBonus);
  if (msLeft === null) {
    return { available: true, currentBalance: row.rune_balance };
  }

  return {
    available: false,
    nextBonusIn: formatNextBonusIn(msLeft),
    currentBalance: row.rune_balance,
  };
}

export type DailyBonusClaimResult =
  | { claimed: true; bonusAmount: number; newBalance: number }
  | {
      claimed: false;
      alreadyClaimed: true;
      nextBonusIn: string;
      currentBalance: number;
    };

export async function claimDailyBonus(profileUserId: string): Promise<DailyBonusClaimResult> {
  return withTransaction(async (client) => {
    const { rows: updated } = await queryClient<{ rune_balance: number }>(
      client,
      `UPDATE users
       SET
         rune_balance = rune_balance + $2,
         last_daily_bonus = NOW()
       WHERE id = $1
         AND (
           last_daily_bonus IS NULL
           OR last_daily_bonus <= NOW() - INTERVAL '24 hours'
         )
       RETURNING rune_balance`,
      [profileUserId, DAILY_BONUS_AMOUNT]
    );

    if (updated[0]) {
      const newBalance = updated[0].rune_balance;
      await queryClient(
        client,
        `INSERT INTO rune_transactions
           (user_id, type, amount, balance_after, description)
         VALUES ($1, 'daily_bonus', $2, $3, $4)`,
        [profileUserId, DAILY_BONUS_AMOUNT, newBalance, "Ежедневный бонус"]
      );
      return {
        claimed: true,
        bonusAmount: DAILY_BONUS_AMOUNT,
        newBalance,
      };
    }

    const { rows: current } = await queryClient<{
      rune_balance: number;
      last_daily_bonus: Date | null;
    }>(client, `SELECT rune_balance, last_daily_bonus FROM users WHERE id = $1`, [
      profileUserId,
    ]);
    const row = current[0];
    const lastBonus = row?.last_daily_bonus ? new Date(row.last_daily_bonus) : null;
    const msLeft = msUntilNextBonus(lastBonus) ?? 0;

    return {
      claimed: false,
      alreadyClaimed: true,
      nextBonusIn: formatNextBonusIn(msLeft),
      currentBalance: row?.rune_balance ?? 0,
    };
  });
}
