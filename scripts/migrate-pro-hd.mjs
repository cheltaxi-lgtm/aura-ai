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
  const exists=(await client.query("SELECT to_regclass('pro.cases') IS NOT NULL AS ok")).rows[0].ok;
  if(!exists) {
    if(/^(1|true|yes)$/i.test(process.env.PRO_MODULE_ENABLED??''))throw new Error('Active Pro schema is missing');
    console.log('Pro inactive: no Pro schema to migrate');
  } else {
    await client.query('BEGIN');
    await client.query(fs.readFileSync(path.join(root,'scripts/migrations/168_pro_hd_delivery_receipts.sql'),'utf8'));
    await client.query('COMMIT');
    console.log('Pro HD delivery receipts ready');
  }
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('Pro HD migration failed:',error.message);process.exitCode=1;}finally{await client.end();}
