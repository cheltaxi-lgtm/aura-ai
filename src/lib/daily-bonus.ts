import { query, withTransaction, queryClient } from "@/lib/db";
import { getRuneSettings } from "@/lib/rune-settings";
import { DAILY_BONUS_AMOUNT } from "@/lib/rune-daily-constants";
import { isBonusIdentityReady } from "@/lib/bonus-identity";
export { DAILY_BONUS_AMOUNT };
const MS_PER_DAY = 86_400_000;
export function formatNextBonusIn(msLeft: number): string {
  const minutes = Math.ceil(Math.max(0, msLeft) / 60_000);
  return `${Math.floor(minutes / 60)}ч ${minutes % 60}м`;
}
type BonusRow = { rune_balance: number; last_daily_bonus: Date | null; server_now: Date };
export function dailyBonusState(row: BonusRow) {
  const now = new Date(row.server_now);
  const next = row.last_daily_bonus ? new Date(new Date(row.last_daily_bonus).getTime() + MS_PER_DAY) : now;
  return {
    available: next.getTime() <= now.getTime(), currentBalance: row.rune_balance, amount: DAILY_BONUS_AMOUNT,
    serverNow: now.toISOString(), nextEligibleAt: next.toISOString(),
    nextBonusIn: formatNextBonusIn(next.getTime() - now.getTime()),
  };
}
export async function getDailyBonusStatus(profileUserId: string) {
  const settings = await getRuneSettings();
  const { rows } = await query<BonusRow>(
    `SELECT rune_balance, last_daily_bonus, NOW() AS server_now FROM users WHERE id = $1`, [profileUserId]
  );
  if (!rows[0]) throw new Error("bonus_user_not_found");
  const state = dailyBonusState(rows[0]);
  const identityReady = await isBonusIdentityReady(profileUserId);
  return { ...state, available: settings.enabled && identityReady && state.available, enabled: settings.enabled, verificationRequired: !identityReady };
}
export type DailyBonusClaimResult = Awaited<ReturnType<typeof getDailyBonusStatus>> & {
  claimed: boolean; alreadyClaimed: boolean; bonusAmount?: number; newBalance?: number; grantId?: string;
};
/** Called only by the authenticated foreground visit/claim POST; never by cron or status reads. */
export async function claimDailyBonus(profileUserId: string): Promise<DailyBonusClaimResult> {
  if (!(await getRuneSettings()).enabled) throw new Error("runes_disabled");
  if (!(await isBonusIdentityReady(profileUserId))) throw new Error("bonus_email_verification_required");
  return withTransaction(async (client) => {
    const { rows: updated } = await queryClient<BonusRow>(client,
      `UPDATE users SET rune_balance = rune_balance + $2, last_daily_bonus = NOW()
       WHERE id = $1 AND (last_daily_bonus IS NULL OR last_daily_bonus <= NOW() - INTERVAL '24 hours')
       RETURNING rune_balance, last_daily_bonus, NOW() AS server_now`, [profileUserId, DAILY_BONUS_AMOUNT]);
    if (updated[0]) {
      const row = updated[0];
      const { rows: grants } = await queryClient<{id:string}>(client,
        `INSERT INTO rune_transactions (user_id,type,amount,balance_after,description)
         VALUES ($1,'daily_bonus',$2,$3,$4) RETURNING id`,
        [profileUserId, DAILY_BONUS_AMOUNT, row.rune_balance, "Бонус за посещение"]);
      return { ...dailyBonusState(row), enabled: true, verificationRequired: false, claimed: true, alreadyClaimed: false,
        bonusAmount: DAILY_BONUS_AMOUNT, newBalance: row.rune_balance, grantId: grants[0].id };
    }
    const { rows } = await queryClient<BonusRow>(client,
      `SELECT rune_balance, last_daily_bonus, NOW() AS server_now FROM users WHERE id=$1`, [profileUserId]);
    if (!rows[0]) throw new Error("bonus_user_not_found");
    return { ...dailyBonusState(rows[0]), enabled: true, verificationRequired: false, claimed: false, alreadyClaimed: true };
  });
}
