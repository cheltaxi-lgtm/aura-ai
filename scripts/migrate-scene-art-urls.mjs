import pg from "pg";

function resolveSceneArtDisplayUrl(url) {
  if (!url) return null;
  try {
    const pathname = url.startsWith("http") ? new URL(url).pathname : url.split("?")[0];
    const apiMatch = pathname.match(/\/api\/scene-art\/[\w-]+\.(jpg|jpeg|png|webp|gif)/i);
    if (apiMatch) return apiMatch[0];
    const legacyMatch = pathname.match(/\/scene-art\/[\w-]+\.(jpg|jpeg|png|webp|gif)/i);
    if (legacyMatch) return legacyMatch[0].replace("/scene-art/", "/api/scene-art/");
  } catch {
    /* ignore */
  }
  return url.replace(/\/scene-art\//, "/api/scene-art/");
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows } = await client.query(`SELECT id, context_data FROM history`);
for (const row of rows) {
  const art = row.context_data?.sceneArt;
  if (!art || typeof art !== "object") continue;
  const next = {};
  let changed = false;
  for (const [key, value] of Object.entries(art)) {
    if (typeof value !== "string") {
      next[key] = value;
      continue;
    }
    const relative = resolveSceneArtDisplayUrl(value);
    next[key] = relative ?? value;
    if (relative !== value) changed = true;
  }
  if (changed) {
    await client.query(
      `UPDATE history SET context_data = jsonb_set(context_data, '{sceneArt}', $2::jsonb, true) WHERE id = $1`,
      [row.id, JSON.stringify(next)]
    );
  }
}

const { rows: after } = await client.query(
  `SELECT character_name, context_data->'sceneArt' as scene_art FROM history`
);
console.log(JSON.stringify(after));
await client.end();
