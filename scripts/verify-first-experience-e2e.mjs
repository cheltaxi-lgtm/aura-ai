import fs from 'node:fs';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import pg from 'pg';
const env={...process.env};for(const file of ['.env.test','.env.test.local']){if(fs.existsSync(file))for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const m=line.match(/^TEST_DATABASE_URL=(.*)$/);if(m)env.DATABASE_URL=m[1].replace(/^["']|["']$/g,'');}}
if(!env.DATABASE_URL||!['localhost','127.0.0.1'].includes(new URL(env.DATABASE_URL).hostname))throw Error('Local test database required');
for(const key of ['YUKASSA_SHOP_ID','YUKASSA_SECRET_KEY','OPENAI_API_KEY','OPENROUTER_API_KEY','BOT_INTERNAL_SECRET','SMTP_HOST','RESEND_API_KEY'])env[key]='';
env.AUTH_SECRET=crypto.randomBytes(32).toString('hex');
env.FIRST_EXPERIENCE_E2E_LOCAL='1';
env.FIRST_EXPERIENCE_ENABLED='true';
delete env.NATAL_E2E_BASE_URL;delete env.NATAL_E2E_STORAGE_STATE;
const shim=path.join(os.tmpdir(),"zovus-tsx-user-shim.cjs");if(fs.existsSync(shim))env.NODE_OPTIONS=`--require=${shim}`;
(async()=>{const client=new pg.Client({connectionString:env.DATABASE_URL});await client.connect();await client.query("INSERT INTO user_accounts(id,email,name,token_version,age_confirmed_at,terms_accepted_at) VALUES('33333333-3333-4333-8333-333333333333','first-experience-e2e@example.invalid','E2E Test',0,now(),now()) ON CONFLICT(id) DO UPDATE SET token_version=0");await client.query("UPDATE rune_packages SET name=CASE id WHEN 'starter' THEN 'Новичок' WHEN 'adept' THEN 'Адепт' WHEN 'keeper' THEN 'Хранитель' WHEN 'chosen' THEN 'Избранный' ELSE name END,price_rub=CASE id WHEN 'starter' THEN 250 WHEN 'adept' THEN 750 WHEN 'keeper' THEN 2500 WHEN 'chosen' THEN 7500 ELSE price_rub END WHERE id IN ('starter','adept','keeper','chosen')");await client.end();
const r=cp.spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test','--project=first-experience','--workers=1',...process.argv.slice(2)],{env,stdio:'inherit'});const cleanup=new pg.Client({connectionString:env.DATABASE_URL});await cleanup.connect();await cleanup.query("DELETE FROM user_accounts WHERE id='33333333-3333-4333-8333-333333333333' AND email='first-experience-e2e@example.invalid'");await cleanup.end();process.exit(r.status??1);})().catch(e=>{console.error(e.message);process.exit(1)});
