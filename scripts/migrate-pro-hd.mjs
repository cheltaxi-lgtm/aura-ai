// Pro may use a separate database; its delivery receipt must exist there before workers start.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const file of ['.env.local','.env']) {
  const name=path.join(root,file);
  if(!fs.existsSync(name))continue;
  for(const line of fs.readFileSync(name,'utf8').split(/\r?\n/)) {
    const m=/^([A-Z_][A-Z_0-9]*)=(.*)$/.exec(line.trim());
    if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^(["'])(.*)\1$/,'$2');
  }
}
const client=new pg.Client({connectionString:process.env.PRO_DATABASE_URL||process.env.DATABASE_URL,
  connectionTimeoutMillis:5000,statement_timeout:30000,
  ssl:process.env.DATABASE_SSL==='require'?{rejectUnauthorized:process.env.DATABASE_SSL_REJECT_UNAUTHORIZED!=='false'}:undefined});
try {
  await client.connect();
  // Historical public bootstrap marked 102/103/112 as represented while the
  // snapshot lacked Pro tables. Replay the actual idempotent Pro DDL, including
  // a separate Pro database. Preserve every existing account and report.
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('pro-schema-migrations',0))");
  const migrations=['102_migrate_pro_schema.sql','103_migrate_pro_delivery_billing.sql','112_migrate_pro_landing.sql','113_migrate_pro_case_type_hd.sql','119_migrate_pro_avito.sql','120_migrate_pro_avito_tenancy.sql','121_migrate_pro_thread_msg_idem.sql','122_migrate_pro_thread_msg_feedback.sql','123_migrate_pro_case_cost_rub.sql','168_pro_hd_delivery_receipts.sql','171_pro_generation_receipts.sql'];
  for(const file of migrations) {
    let sql=fs.readFileSync(path.join(root,'scripts/migrations',file),'utf8');
    // The runner owns one transaction; never let a nested migration commit it.
    sql=sql.replace(/^\s*(?:BEGIN|COMMIT);\s*$/gm,'');
    // 119 contains obsolete public-schema cleanup. A Pro-only repair must
    // never delete unrelated legacy public tables, even if they exist.
    sql=sql.replace(/^DROP TABLE IF EXISTS avito_(?:messages|chats);\s*$/gm,'');
    await client.query(sql);
  }
  await client.query('COMMIT');
  console.log('Pro schema and durable generation receipts ready');
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('Pro schema migration failed:',error.message);process.exitCode=1;}finally{await client.end();}
