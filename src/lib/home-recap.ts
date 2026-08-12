import { query } from "@/lib/db";

export {
  buildHomeRecapKey,
  cardsKeyFromHomeRecapKey,
  isHomeRecapHidden,
  readHomeRecapHiddenKey,
  type HomeRecapSource,
} from "@/lib/home-recap-key";

export async function setHomeRecapHiddenKey(
  userId: string,
  hiddenKey: string
): Promise<string> {
  const key = hiddenKey.trim();
  if (!key) throw new Error("hiddenKey required");
  await query(
    `UPDATE users
     SET astro_meta = jsonb_set(
       COALESCE(astro_meta, '{}'::jsonb),
       '{homeRecapHiddenKey}',
       to_jsonb($2::text),
       true
     )
     WHERE id = $1`,
    [userId, key]
  );
  return key;
}

export async function getHomeRecapHiddenKey(userId: string): Promise<string | null> {
  const { rows } = await query<{ key: string | null }>(
    `SELECT astro_meta->>'homeRecapHiddenKey' AS key FROM users WHERE id = $1`,
    [userId]
  );
  const key = rows[0]?.key;
  return typeof key === "string" && key.trim() ? key.trim() : null;
}
