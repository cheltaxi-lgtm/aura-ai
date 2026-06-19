import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows: history } = await client.query(
  `SELECT id, user_id, character_name, context_data->'sceneArt' AS scene_art
   FROM history ORDER BY created_at DESC LIMIT 5`
);
console.log("history:", JSON.stringify(history, null, 2));

const { rows: accounts } = await client.query(
  `SELECT id, email, profile_user_id FROM user_accounts LIMIT 10`
);
console.log("accounts:", JSON.stringify(accounts, null, 2));

await client.end();
