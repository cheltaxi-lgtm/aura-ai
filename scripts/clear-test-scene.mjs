import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(
  `UPDATE history SET context_data = context_data - 'sceneArt'
   WHERE context_data->'sceneArt'->>'destiny_card' LIKE 'https://example.com/%'`
);
const { rows } = await client.query(
  `SELECT character_name, context_data->'sceneArt' as scene_art FROM history ORDER BY created_at DESC`
);
console.log(JSON.stringify(rows));
await client.end();
