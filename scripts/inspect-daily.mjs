import fs from "fs";
import pg from "pg";

const env = fs.readFileSync("/opt/aura-ai/.env.local", "utf8");
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = (m ? m[1] : "").trim().replace(/^["']|["']$/g, "");

const c = new pg.Client({ connectionString: url });
await c.connect();
const r = await c.query(
  "SELECT user_id, character_key, deck_system, cards, reading_text, reading_date FROM daily_readings ORDER BY reading_date DESC LIMIT 3"
);
for (const row of r.rows) {
  console.log("=== row ===");
  console.log("date:", row.reading_date, "master:", row.character_key, "system:", row.deck_system);
  console.log("cards:", JSON.stringify(row.cards));
  console.log("text:", String(row.reading_text).slice(0, 400));
  console.log("");
}
await c.end();
