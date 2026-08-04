const { Client } = require("pg");
const fs = require("fs");
const env = fs.readFileSync("/opt/aura-ai/.env.local", "utf8");
const m = env.match(/^DATABASE_URL=(.+)$/m);
const c = new Client({ connectionString: m[1].trim() });
c.connect()
  .then(() => c.query("SELECT fingerprint FROM hd_charts ORDER BY created_at DESC LIMIT 1"))
  .then((r) => {
    console.log("fp:", r.rows[0] ? r.rows[0].fingerprint : "none");
    return c.end();
  })
  .catch((e) => {
    console.error("ERR", e.message);
    process.exit(1);
  });
