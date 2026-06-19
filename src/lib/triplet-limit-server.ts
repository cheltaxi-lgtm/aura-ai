import { query } from "@/lib/db";
import { tripletCooldownFromLastDraw, type TripletCooldownStatus } from "@/lib/triplet-limit";

export async function checkTripletCooldown(userId: string): Promise<TripletCooldownStatus> {
  const { rows } = await query<{ created_at: Date }>(
    `SELECT created_at FROM history
     WHERE user_id = $1 AND character_name = 'triplet'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  return tripletCooldownFromLastDraw(rows[0]?.created_at ?? null);
}
