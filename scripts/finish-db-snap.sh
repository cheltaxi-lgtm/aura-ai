#!/bin/bash
set -euo pipefail
DIR=/opt/aura-ai-rollbacks/20260805T115030Z
export SNAP_DIR="$DIR"
if [ ! -d "$DIR" ]; then
  echo "snapshot dir missing: $DIR"
  exit 1
fi
if ! command -v pg_dump >/dev/null; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-client
fi
which pg_dump
cd /opt/aura-ai
node <<'NODE'
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { Client } = require("pg");
const dir = process.env.SNAP_DIR;
for (const line of fs.readFileSync("/opt/aura-ai/.env.local", "utf8").split(/\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!m || process.env[m[1]]) continue;
  let v = m[2].trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  )
    v = v.slice(1, -1);
  process.env[m[1]] = v;
}
const url = process.env.DATABASE_URL;
const u = new URL(url);
const env = { ...process.env, PGPASSWORD: decodeURIComponent(u.password || "") };
const host = u.hostname;
const port = u.port || "5432";
const user = decodeURIComponent(u.username);
const db = (u.pathname || "/").slice(1);
function dump(args, out) {
  const r = spawnSync("pg_dump", args, {
    env,
    encoding: "buffer",
    maxBuffer: 512 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.error(String(r.stderr));
    process.exit(r.status || 1);
  }
  fs.writeFileSync(out, r.stdout);
  console.log("wrote", out, r.stdout.length);
}
dump(
  ["-h", host, "-p", port, "-U", user, "-d", db, "--no-owner", "--format=custom"],
  path.join(dir, "db-full.dump")
);
dump(
  [
    "-h",
    host,
    "-p",
    port,
    "-U",
    user,
    "-d",
    db,
    "--no-owner",
    "--schema=pro",
    "--format=plain",
  ],
  path.join(dir, "db-pro.sql")
);
(async () => {
  const c = new Client({ connectionString: url });
  await c.connect();
  const m = await c.query(
    "select version from schema_migrations order by version desc limit 8"
  );
  fs.writeFileSync(
    path.join(dir, "schema_migrations_tip.txt"),
    m.rows.map((r) => r.version).join("\n") + "\n"
  );
  const pro = await c.query(
    "select count(*)::int n from pg_tables where schemaname='pro'"
  );
  fs.appendFileSync(
    path.join(dir, "MANIFEST.txt"),
    `pro_tables=${pro.rows[0].n}\ndb_dump=ok\n`
  );
  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
NODE

if [ ! -f "$DIR/RESTORE.sh" ]; then
cat > "$DIR/RESTORE.sh" <<'RESTORE'
#!/bin/bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
echo "WARNING: restores /opt/aura-ai from $DIR"
read -r -p "Type YES to continue: " ok
[ "$ok" = "YES" ] || exit 1
systemctl stop aura-ai aura-ai-async-jobs zovus-telegram-bot || true
rm -rf /opt/aura-ai
tar -xzf "$DIR/aura-ai-tree.tgz" -C /opt
cp -a "$DIR/env.local.bak" /opt/aura-ai/.env.local
[ -f "$DIR/telegram-bot.env.bak" ] && cp -a "$DIR/telegram-bot.env.bak" /opt/aura-ai/telegram-bot/.env
[ -f "$DIR/env.async-jobs.bak" ] && cp -a "$DIR/env.async-jobs.bak" /opt/aura-ai/.env.async-jobs
cd /opt/aura-ai
bash hosting/ensure-async-jobs-user.sh /opt/aura-ai || true
systemctl start aura-ai aura-ai-async-jobs zovus-telegram-bot
echo "App tree restored from $DIR"
echo "DB restore (optional): pg_restore --clean --if-exists -d \$DATABASE_URL $DIR/db-full.dump"
RESTORE
chmod +x "$DIR/RESTORE.sh"
fi
ln -sfn "$DIR" /opt/aura-ai-rollbacks/latest
ls -lah "$DIR"
du -sh "$DIR"
echo "ROLLBACK_SNAPSHOT_OK $DIR"
