import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const STATIC_TYPES = new Set(['position', 'house', 'aspect', 'nakshatra', 'pattern']);
const EVIDENCE_FIELDS = ['id', 'tradition', 'category', 'type', 'label', 'value', 'sourcePath', 'confidence', 'uncertainty', 'deepLink'];

/** Writers must be stopped; freeze only provably matching legacy numeric data. */
export async function freezeNatalLegacyHistory(client, buildEvidence, backupDirectory) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='20s'");
    await client.query('SELECT id FROM users WHERE id IN (SELECT user_id FROM natal_report_history WHERE chart_snapshot IS NULL) ORDER BY id FOR UPDATE');
    await client.query('SELECT user_id FROM natal_charts WHERE user_id IN (SELECT user_id FROM natal_report_history WHERE chart_snapshot IS NULL) ORDER BY user_id FOR UPDATE');
    await client.query('SELECT id FROM natal_report_history WHERE chart_snapshot IS NULL ORDER BY user_id,id FOR UPDATE');
    const { rows } = await client.query(`SELECT to_jsonb(h) AS history, md5((to_jsonb(h)-'chart_snapshot')::text) AS report_digest,
      c.chart_data, c.engine_version AS chart_engine FROM natal_report_history h LEFT JOIN natal_charts c ON c.user_id=h.user_id
      WHERE h.chart_snapshot IS NULL ORDER BY h.user_id,h.id`);
    let staticFactors = 0, timingOriginalFactors = 0;
    const prepared = [];
    for (const row of rows) {
      const h = row.history, chart = row.chart_data;
      if (!chart || chart.userId !== h.user_id || chart.birthFingerprint !== h.birth_fingerprint ||
          chart.engineVersion !== h.engine_version || row.chart_engine !== h.engine_version ||
          chart.western?.ephemeris !== h.ephemeris || !Array.isArray(h.evidence_refs)) throw Error('ineligible_historical_receipt');
      const current = new Map(buildEvidence(chart, { tradition: h.tradition }).map(item => [item.id, item]));
      for (const item of h.evidence_refs) {
        if (!STATIC_TYPES.has(item.type)) { timingOriginalFactors++; continue; }
        const actual = current.get(item.id);
        if (!actual || EVIDENCE_FIELDS.some(key => JSON.stringify(actual[key]) !== JSON.stringify(item[key]))) throw Error('static_evidence_mismatch');
        staticFactors++;
      }
      const snapshot = structuredClone(chart);
      for (const key of ['interpretation', 'interpretations', 'interpretationClaims', 'transits', 'transitCacheDate']) delete snapshot[key];
      prepared.push({ ...row, snapshot });
    }
    let backupFile = null;
    if (prepared.length) {
      fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
      if (!fs.lstatSync(backupDirectory).isDirectory() || fs.lstatSync(backupDirectory).isSymbolicLink()) throw Error('unsafe_backup_directory');
      fs.chmodSync(backupDirectory, 0o700);
      backupFile = path.join(backupDirectory, new Date().toISOString().replaceAll(':', '-') + '-before.json');
      const fd = fs.openSync(backupFile, 'wx', 0o600);
      try { fs.writeFileSync(fd, JSON.stringify({ at: new Date().toISOString(), staticFactors, timingOriginalFactors, rows: prepared })); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      if (process.platform !== 'win32') { const dir = fs.openSync(backupDirectory, 'r'); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); } }
      for (const row of prepared) {
        const h = row.history;
        const updated = await client.query(`UPDATE natal_report_history h SET chart_snapshot=$2::jsonb WHERE h.id=$1 AND h.chart_snapshot IS NULL
          AND md5((to_jsonb(h)-'chart_snapshot')::text)=$3 RETURNING id`, [h.id, JSON.stringify(row.snapshot), row.report_digest]);
        if (updated.rowCount !== 1) throw Error('freeze_compare_and_set_failed');
        const check = await client.query(`SELECT md5((to_jsonb(h)-'chart_snapshot')::text)=$2 AS unchanged,
          chart_snapshot->>'engineVersion'=$3 AS engine_preserved FROM natal_report_history h WHERE id=$1`, [h.id, row.report_digest, h.engine_version]);
        if (!check.rows[0]?.unchanged || !check.rows[0]?.engine_preserved) throw Error('report_or_receipt_changed');
      }
    }
    await client.query('COMMIT');
    return { frozen: prepared.length, staticFactors, timingOriginalFactors, reportAndReceiptFieldsUnchanged: prepared.length, backupFile };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

async function main(appDirectory) {
  if (!path.isAbsolute(appDirectory)) throw Error('absolute_app_directory_required');
  for (const unit of ['aura-ai', 'aura-ai-async-jobs', 'zovus-telegram-bot']) {
    if (spawnSync('systemctl', ['is-active', unit], { encoding: 'utf8' }).stdout.trim() !== 'inactive') throw Error('writers_not_stopped');
  }
  const pg = createRequire(path.join(appDirectory, 'package.json'))('pg');
  const natal = await import(pathToFileURL(path.join(appDirectory, 'src/lib/natal/evidence.ts')).href);
  const build = natal.buildNatalEvidence ?? natal.default?.buildNatalEvidence;
  if (typeof build !== 'function') throw Error('legacy_evidence_builder_missing');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  try { await client.connect(); console.log(JSON.stringify(await freezeNatalLegacyHistory(client, build, path.join(appDirectory, 'backups/natal-legacy-freeze')))); }
  finally { await client.end(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(process.argv[2] || ''); }
  catch { console.error('natal_legacy_freeze_failed_no_payload_output'); process.exitCode = 1; }
}
