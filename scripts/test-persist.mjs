import pg from "pg";

const userId = "2383df09-bb04-444d-9672-b9f3afd8c34c";
const testUrl = "https://example.com/destiny-test.jpg";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows } = await client.query(
  `SELECT id, character_name, context_data
   FROM history WHERE user_id = $1 ORDER BY created_at DESC`,
  [userId]
);

function cardsKey(cards) {
  return (cards ?? []).map((c) => c.name).join("|");
}

const cardsKeyTarget = "Суд|Башня|Колесница";
const characterId = "ragnar";
const ids = [];

for (const row of rows) {
  const ctx = row.context_data ?? {};
  const rowCardsKey = cardsKey(ctx.tarotCards);
  if (row.character_name === "triplet") {
    if (rowCardsKey === cardsKeyTarget) ids.push(row.id);
    continue;
  }
  if (ctx.type === "reading") {
    if (row.character_name !== characterId) continue;
    if (rowCardsKey !== cardsKeyTarget) continue;
    ids.push(row.id);
  }
}

console.log("rows found:", rows.length, "ids to patch:", ids);

for (const id of ids) {
  const r = await client.query(
    `UPDATE history SET context_data = jsonb_set(
       COALESCE(context_data, '{}'::jsonb),
       '{sceneArt}',
       COALESCE(context_data->'sceneArt', '{}'::jsonb) || jsonb_build_object('destiny_card', $3::text),
       true
     )
     WHERE id = $1 AND user_id = $2
     RETURNING context_data->'sceneArt' as scene_art`,
    [id, userId, testUrl]
  );
  console.log("patched", id, "rowCount", r.rowCount, r.rows[0]);
}

await client.end();
