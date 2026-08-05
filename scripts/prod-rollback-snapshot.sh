#!/bin/bash
# Full prod rollback snapshot: app tree + envs + DB dump + RESTORE.sh
set -euo pipefail
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DIR=/opt/aura-ai-rollbacks/$STAMP
mkdir -p "$DIR"
export SNAP_DIR="$DIR"
echo "Snapshot dir: $DIR"

{
  echo "stamp=$STAMP"
  echo "host=$(hostname)"
  echo "date=$(date -u -Iseconds)"
  echo -n "services="
  systemctl is-active aura-ai aura-ai-async-jobs zovus-telegram-bot caddy | paste -sd, -
} > "$DIR/MANIFEST.txt"

echo "Packing /opt/aura-ai ..."
tar --exclude='node_modules' \
    --exclude='telegram-bot/node_modules' \
    --exclude='logs' \
    --exclude='.git' \
    -czf "$DIR/aura-ai-tree.tgz" -C /opt aura-ai

cp -a /opt/aura-ai/.env.local "$DIR/env.local.bak"
cp -a /opt/aura-ai/telegram-bot/.env "$DIR/telegram-bot.env.bak" 2>/dev/null || true
cp -a /opt/aura-ai/.env.async-jobs "$DIR/env.async-jobs.bak" 2>/dev/null || true
grep -E '^PRO_' /opt/aura-ai/.env.local > "$DIR/pro-flags.env" || true

cd /opt/aura-ai
node <<'NODE'
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { Client } = require("pg");
const dir = process.env.SNAP_DIR;
if (!dir) throw new Error("SNAP_DIR missing");
for (const line of fs.readFileSync("/opt/aura-ai/.env.local", "utf8").split(/\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!m || process.env[m[1]]) continue;
  let v = m[2].trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  process.env[m[1]] = v;
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");
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
    console.error(String(r.stderr || r.stdout));
    process.exit(r.status || 1);
  }
  fs.writeFileSync(out, r.stdout);
  console.log("wrote", out, "bytes", r.stdout.length);
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
  fs.appendFileSync(path.join(dir, "MANIFEST.txt"), `pro_tables=${pro.rows[0].n}\n`);
  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
NODE

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
if [ -f "$DIR/db-full.dump" ]; then
  read -r -p "Also restore FULL DB from dump? Type YES: " ok2
  if [ "$ok2" = "YES" ]; then
    cd /opt/aura-ai
    node -e '
const fs=require("fs");const {spawnSync}=require("child_process");
for (const line of fs.readFileSync(".env.local","utf8").split(/\n/)){const m=line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);if(!m||process.env[m[1]])continue;let v=m[2].trim();if((v.startsWith("\"")&&v.endsWith("\""))||(v.startsWith("'"'"'")&&v.endsWith("'"'"'")))v=v.slice(1,-1);process.env[m[1]]=v;}
const u=new URL(process.env.DATABASE_URL);const env={...process.env,PGPASSWORD:decodeURIComponent(u.password||"")};
const r=spawnSync("pg_restore",["-h",u.hostname,"-p",u.port||"5432","-U",decodeURIComponent(u.username),"-d",(u.pathname||"/").slice(1),"--clean","--if-exists","--no-owner",process.argv[1]],{env,stdio:"inherit"});
process.exit(r.status||0);
' "$DIR/db-full.dump"
  fi
fi
cd /opt/aura-ai
bash hosting/ensure-async-jobs-user.sh /opt/aura-ai || true
systemctl start aura-ai aura-ai-async-jobs zovus-telegram-bot
systemctl is-active aura-ai aura-ai-async-jobs zovus-telegram-bot
echo "Restored from $DIR"
RESTORE
chmod +x "$DIR/RESTORE.sh"

ln -sfn "$DIR" /opt/aura-ai-rollbacks/latest
ls -lah "$DIR"
du -sh "$DIR"
echo "ROLLBACK_SNAPSHOT_OK $DIR"
