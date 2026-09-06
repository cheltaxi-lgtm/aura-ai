import {describe,it,expect} from 'vitest';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {NextRequest} from 'next/server';
import {query,getPool} from '@/lib/db';
import {claimNatalInterpretationResilient,saveCurrentNatalInterpretation} from '@/lib/services/natal-chart-service';
import {getNatalPrintRecord} from '@/lib/reports/natal-print-data';
import {deleteCompatibilityRecord} from '@/lib/services/natal-compatibility-service';
import {countUserPalmReadings} from '@/lib/palm-reading-billing';
import {getCachedPersonalTiming} from '@/lib/services/natal-timing-service';
import {TIMING_ENGINE_VERSION} from '@/lib/natal/timing';
import {getActivePublicReportShare} from '@/lib/services/public-report-share-service';
import {deleteFact} from '@/lib/memory/user-facts';
import {getSessionMemories,upsertSessionMemoryFromChat} from '@/lib/session-memory';
import {enqueueMemoryExtraction} from '@/lib/memory/extraction-jobs';
import {getCabinetSessions} from '@/lib/cabinet-data';
import {privatePdfAvailable} from '@/lib/reports/private-pdf-access';
import {calculateHdChart} from '@/lib/human-design/calculate';
import {BillingService} from '@/lib/services/billing-service';
import {shouldRefundBeforeWorkerFail} from '@/lib/async-job-lifecycle';
import {completeHdReport,getHdReportById,markHdReportNeedsRegeneration,approveHdReportManually,beginHdReportQualityResume,beginHdReportRewrite,restoreHdReportDone,isHdReportReadable,isHdReportRewriteInProgress,isStalePendingReport,reconcileHdReportCharges,toPublicHdReport,createPendingCompositeReport,completeCompositeReport,getHdCompositeReportById,type HdChartRow} from '@/lib/services/human-design-service';
import {hasTestDb,installDbLifecycle} from './db/setup';

describe.runIf(hasTestDb)('full audit artifact isolation',()=>{
 installDbLifecycle();
 async function user(){return (await query("INSERT INTO users(name,gender,zodiac) VALUES('Full audit QA','female','test') RETURNING id")).rows[0].id as string;}
 async function chart(id:string,cached=false){await query("INSERT INTO natal_charts(user_id,engine_version,chart_data) VALUES($1,'test-engine',$2)",[id,{birthFingerprint:'current',engineVersion:'test-engine',western:{ephemeris:'celestine'},...(cached?{interpretations:{western:'Old paid interpretation'}}:{})}]);}
 async function history(id:string,fingerprint='current',ephemeris='celestine'){return (await query("INSERT INTO natal_report_history(user_id,birth_fingerprint,engine_version,ephemeris,tradition,content) VALUES($1,$2,'test-engine',$3,'western','Old paid interpretation') RETURNING id",[id,fingerprint,ephemeris])).rows[0].id as string;}
 it('does not steal an active interpretation claim on retry',async()=>{
  const id=await user();await chart(id);const first=await claimNatalInterpretationResilient(id,'western','current','test-engine','celestine');expect(first.status).toBe('claimed');
  expect((await claimNatalInterpretationResilient(id,'western','current','test-engine','celestine')).status).toBe('busy');
 });
 it('regenerates atomically while preserving old paid content and other identities',async()=>{
  const id=await user();await chart(id,true);const current=await history(id);const old=await history(id,'previous');const options={reportType:'interpretation',forceRegenerate:true};
  const claim=await claimNatalInterpretationResilient(id,'western','current','test-engine','celestine',options);expect(claim.status).toBe('claimed');if(claim.status!=='claimed')return;
  expect((await query('SELECT content FROM natal_report_history WHERE id=$1',[current])).rows[0].content).toBe('Old paid interpretation');
  const request={userId:id,tradition:'western' as const,interpretation:'New paid interpretation',expectedBirthFingerprint:'current',expectedEngineVersion:'test-engine',expectedEphemeris:'celestine',claimToken:claim.token,runeCost:30,forceRegenerate:true};
  expect((await saveCurrentNatalInterpretation(request)).status).toBe('saved');
  const regenerated=(await query('SELECT content,chart_snapshot FROM natal_report_history WHERE id=$1',[current])).rows[0];
  expect(regenerated.content).toBe('New paid interpretation');expect(regenerated.chart_snapshot.birthFingerprint).toBe('current');
  await query("UPDATE natal_charts SET chart_data = chart_data || $2::jsonb WHERE user_id=$1",[id,JSON.stringify({birthFingerprint:'changed'})]);
  expect((await getNatalPrintRecord(id,current))?.chart_data).toMatchObject({birthFingerprint:'current'});
  expect((await query('SELECT content FROM natal_report_history WHERE id=$1',[old])).rows[0].content).toBe('Old paid interpretation');
 });
 it('does not draw a different ephemeris chart under a historical natal report',async()=>{
  const id=await user();await chart(id);const report=await history(id,'current','swiss');expect((await getNatalPrintRecord(id,report))?.chart_data).toBeNull();
 });
 it('foreign compatibility deletion cannot revoke the owners shared report',async()=>{
  const owner=await user(),foreign=await user();const id=(await query("INSERT INTO natal_compatibility_reports(owner_user_id,mode,status,owner_label,partner_label,owner_fingerprint,expires_at,report_data,evidence_refs,completed_at,partner_fingerprint,pair_fingerprint,synastry_snapshot) VALUES($1,'manual','completed','A','B',$2,NOW()+interval '1 day','{}','[]',NOW(),$2,$2,'{}') RETURNING id",[owner,'a'.repeat(64)])).rows[0].id;
  const token=randomBytes(32).toString('base64url');await query("INSERT INTO private_report_shares(owner_user_id,token,report_kind,report_id,selected_sections,public_payload,expires_at) VALUES($1,$2,'compatibility',$3,ARRAY['summary'],'{}',NOW()+interval '1 day')",[owner,token,id]);
  expect(await deleteCompatibilityRecord(id,foreign)).toBe(false);expect((await query('SELECT revoked_at FROM private_report_shares WHERE token=$1',[token])).rows[0].revoked_at).toBeNull();
 });
 it('a refunded first palm attempt keeps the first-reading discount',async()=>{
  const id=await user();const spend=(await query("INSERT INTO rune_transactions(user_id,type,amount,balance_after,description,action_type) VALUES($1,'spend',-30,70,'Synthetic palm','PALM_READING') RETURNING id",[id])).rows[0].id;
  await query("INSERT INTO rune_transactions(user_id,type,amount,balance_after,description,refund_of_transaction_id) VALUES($1,'refund',30,100,'Synthetic refund',$2)",[id,spend]);expect(await countUserPalmReadings(id)).toBe(0);
 });
 it('timing cache is bound to the exact birth, engine and ephemeris',async()=>{
  const id=await user();const identity={birthFingerprint:'current',engineVersion:'test-engine',ephemeris:'celestine'};
  await query("INSERT INTO natal_timing_cache(user_id,horizon_days,window_start,window_end,engine_version,birth_fingerprint,timing_data,generated_at) VALUES($1,7,CURRENT_DATE,CURRENT_DATE+7,$2,'current',$3,NOW())",[id,TIMING_ENGINE_VERSION,{sourceChart:identity,events:[]}]);
  expect(await getCachedPersonalTiming(id,identity)).not.toBeNull();
  for(const mismatch of [{birthFingerprint:'other'},{engineVersion:'next'},{ephemeris:'swiss'}]) expect(await getCachedPersonalTiming(id,{...identity,...mismatch})).toBeNull();
 });
 it('an orphaned public payload is never served after source deletion',async()=>{
  const id=await user();const report=await history(id);const token=randomBytes(32).toString('base64url');
  await query("INSERT INTO private_report_shares(owner_user_id,token,report_kind,report_id,selected_sections,public_payload,expires_at) VALUES($1,$2,'natal',$3,ARRAY['summary'],'{}',NOW()+interval '1 day')",[id,token,report]);
  expect(await getActivePublicReportShare(token)).not.toBeNull();
  await query('DELETE FROM natal_report_history WHERE id=$1',[report]);
  expect(await getActivePublicReportShare(token)).toBeNull();
 });
 it('share insertion waits for source deletion and cannot create an active orphan',async()=>{
  const id=await user();const report=await history(id);const token=randomBytes(32).toString('base64url');
  const client=await getPool().connect();
  try {
   await client.query('BEGIN');await client.query('SELECT id FROM natal_report_history WHERE id=$1 FOR UPDATE',[report]);
   let finished=false;
   const insertion=query("INSERT INTO private_report_shares(owner_user_id,token,report_kind,report_id,selected_sections,public_payload,expires_at) VALUES($1,$2,'natal',$3,ARRAY['summary'],'{}',NOW()+interval '1 day')",[id,token,report]).then(()=>{finished=true;return null},err=>{finished=true;return err});
   // Wait until PostgreSQL confirms the second connection is blocked on our source lock.
   let waiting=false;
   for(let attempt=0;attempt<30;attempt++) {
    await client.query('SELECT pg_stat_clear_snapshot()');
    const locks=await client.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'INSERT INTO private_report_shares%'");
    if(locks.rowCount){waiting=true;break;}
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   expect(waiting).toBe(true);expect(finished).toBe(false);
   await client.query('DELETE FROM natal_report_history WHERE id=$1',[report]);await client.query('COMMIT');
   expect((await insertion)?.code).toBe('23503');expect(await getActivePublicReportShare(token)).toBeNull();
  } finally {await client.query('ROLLBACK');client.release();}
 });
 it('forget excludes old summaries and rejects late summary and extraction writes while preserving chat',async()=>{
  const id=await user();const session=(await query("INSERT INTO sessions(user_id,character_key) VALUES($1,'tarot') RETURNING id",[id])).rows[0].id;
  await query("INSERT INTO user_memory_preferences(user_id,memory_enabled,auto_capture_enabled) VALUES($1,true,true)",[id]);
  await upsertSessionMemoryFromChat({userId:id,sessionId:session,characterKey:'tarot',topicSummary:'Private old topic',keyCards:[],prediction:'Private paraphrase'});
  const fact=(await query("INSERT INTO user_facts(user_id,fact,source_type,source_entity_id) VALUES($1,'Private fact','chat',$2) RETURNING id",[id,session])).rows[0].id;
  expect((await getSessionMemories(id,'tarot')).length).toBe(1);expect(await deleteFact(id,fact)).toBe(true);
  await upsertSessionMemoryFromChat({userId:id,sessionId:session,characterKey:'tarot',topicSummary:'Late paraphrase',keyCards:[],prediction:'Late data'});
  expect(await getSessionMemories(id,'tarot')).toEqual([]);
  expect(await enqueueMemoryExtraction({userId:id,sourceType:'chat',sourceEntityId:session,userMessage:'Paraphrased old fact'})).toBeNull();
  expect((await query('SELECT id FROM sessions WHERE id=$1',[session])).rowCount).toBe(1);
  const fresh=(await query("INSERT INTO sessions(user_id,character_key) VALUES($1,'tarot') RETURNING id",[id])).rows[0].id;
  await upsertSessionMemoryFromChat({userId:id,sessionId:fresh,characterKey:'tarot',topicSummary:'New independent topic',keyCards:[],prediction:'New data'});
  expect((await getSessionMemories(id,'tarot')).map(m=>m.topicSummary)).toEqual(['New independent topic']);
 });

 async function hdChart(userId:string,birthDate='1990-08-15'):Promise<HdChartRow>{
  const id=randomUUID(),calculated=calculateHdChart({birthDate,birthTime:'12:00',timezone:'Europe/Moscow'});
  const row:HdChartRow={id,userId,birthDate,birthTime:'12:00',timeUnknown:false,timezone:'Europe/Moscow',placeName:'Москва',lat:55.75,lon:37.62,fingerprint:randomBytes(32).toString('hex'),chart:calculated,engineVersion:calculated.engineVersion,subjectKind:'self',subjectName:null,relationToSelf:null,gender:null,createdAt:new Date().toISOString()};
  await query("INSERT INTO hd_charts(id,user_id,birth_date,birth_time,timezone,place_name,lat,lon,fingerprint,chart,engine_version) VALUES($1,$2,$3,'12:00','Europe/Moscow','Москва',55.75,37.62,$4,$5,$6)",[id,userId,birthDate,row.fingerprint,calculated,row.engineVersion]);return row;
 }
 it('HD paid and manually approved drafts retain the exact chart used at generation',async()=>{
  const id=await user(),source=await hdChart(id);const report=(await query("INSERT INTO hd_reports(chart_id,user_id) VALUES($1,$2) RETURNING id",[source.id,id])).rows[0].id;
  expect(await completeHdReport(report,'Saved paid text','fixture',{chartSnapshot:source})).toBe(true);
  await query("UPDATE hd_charts SET chart='{}',engine_version='future' WHERE id=$1",[source.id]);
  expect((await getHdReportById(report,id))?.chartSnapshot).toEqual(source);
  await markHdReportNeedsRegeneration(report,'Draft text',[],source);expect(await approveHdReportManually(report)).toBe(true);
  expect((await getHdReportById(report,id))?.chartSnapshot).toEqual(source);
 });
 it('HD admin rewrite claims once and restores the previous paid report on failure',async()=>{
  const id=await user(),source=await hdChart(id);const report=(await query("INSERT INTO hd_reports(chart_id,user_id,status,report_text,package_id) VALUES($1,$2,'done','Previous premium report','max') RETURNING id",[source.id,id])).rows[0].id;
  expect(await beginHdReportRewrite(report)).toBe(true);expect(await beginHdReportRewrite(report)).toBe(false);
  await restoreHdReportDone(report);
  expect((await query('SELECT status,report_text FROM hd_reports WHERE id=$1',[report])).rows[0]).toMatchObject({status:'done',report_text:'Previous premium report'});
 });
 it('a stale HD admin rewrite stays readable and cannot enter the client rebilling path',async()=>{
  const id=await user(),source=await hdChart(id);const report=(await query("INSERT INTO hd_reports(chart_id,user_id,status,report_text,package_id) VALUES($1,$2,'done','Retained paid report','max') RETURNING id",[source.id,id])).rows[0].id;
  expect(await beginHdReportRewrite(report)).toBe(true);
  await query("UPDATE hd_reports SET created_at=now()-interval '11 minutes' WHERE id=$1",[report]);
  const stale=await getHdReportById(report,id);expect(stale).not.toBeNull();
  expect(isStalePendingReport(stale!)).toBe(true);expect(isHdReportRewriteInProgress(stale!)).toBe(true);expect(isHdReportReadable(stale!)).toBe(true);
  expect(toPublicHdReport(stale!)).toMatchObject({status:'done',reportText:'Retained paid report',refreshing:true});
  const route=readFileSync('src/app/api/human-design/report/route.ts','utf8');
  expect(route.indexOf('isHdReportRewriteInProgress(existing)')).toBeLessThan(route.indexOf('let resumePaidPending'));
  const ask=readFileSync('src/app/api/human-design/report/ask/route.ts','utf8');const print=readFileSync('src/app/cabinet/human-design/reports/[id]/print/page.tsx','utf8');
  expect(ask).toContain('isHdReportReadable(report)');expect(print).toContain('isHdReportReadable(report)');
  expect(await privatePdfAvailable(`/cabinet/human-design/reports/${report}/print`,id)).toBe(true);
  const cabinet=await getCabinetSessions(id);expect(cabinet.sessions.some(item=>item.id===report)).toBe(true);expect(cabinet.total).toBeGreaterThanOrEqual(1);
 });
 it('a quality-resume draft stays hidden even though pending retains its text',async()=>{
  const id=await user(),source=await hdChart(id),transaction=randomUUID();const report=(await query("INSERT INTO hd_reports(chart_id,user_id,status,report_text,transaction_id,package_id) VALUES($1,$2,'done','Old paid report',$3,'max') RETURNING id",[source.id,id,transaction])).rows[0].id;
  await markHdReportNeedsRegeneration(report,'Rejected QA draft',[{code:'quality'}],source);expect(await beginHdReportQualityResume(report)).toBe(true);
  await query("UPDATE hd_reports SET created_at=now()-interval '11 minutes' WHERE id=$1",[report]);
  const draft=await getHdReportById(report,id);expect(draft).not.toBeNull();expect(isStalePendingReport(draft!)).toBe(true);
  expect(isHdReportRewriteInProgress(draft!)).toBe(false);expect(isHdReportReadable(draft!)).toBe(false);
  expect(toPublicHdReport(draft!)).toMatchObject({status:'pending',reportText:null,refreshing:false});
  expect(await privatePdfAvailable(`/cabinet/human-design/reports/${report}/print`,id)).toBe(false);
  const cabinet=await getCabinetSessions(id);expect(cabinet.sessions.some(item=>item.id===report)).toBe(false);
 });
 it('reconciler restores a crashed admin rewrite without refunding its delivered purchase',async()=>{
  const id=await user();await query('UPDATE users SET rune_balance=70 WHERE id=$1',[id]);const source=await hdChart(id);
  const transaction=(await query("INSERT INTO rune_transactions(user_id,type,amount,balance_after,description,action_type) VALUES($1,'spend',-30,70,'Delivered HD report','HD_REPORT') RETURNING id",[id])).rows[0].id as string;
  const report=(await query("INSERT INTO hd_reports(chart_id,user_id,status,report_text,transaction_id,package_id) VALUES($1,$2,'done','Delivered premium report',$3,'max') RETURNING id",[source.id,id,transaction])).rows[0].id;
  expect(await beginHdReportRewrite(report)).toBe(true);await query("UPDATE hd_reports SET updated_at=now()-interval '61 minutes' WHERE id=$1",[report]);
  expect(await reconcileHdReportCharges()).toBe(0);
  const restored=await getHdReportById(report,id);expect(restored).toMatchObject({status:'done',reportText:'Delivered premium report',transactionId:transaction,adminRewriteStartedAt:null});
  expect((await query('SELECT rune_balance FROM users WHERE id=$1',[id])).rows[0].rune_balance).toBe(70);
  expect((await query("SELECT 1 FROM rune_transactions WHERE type='refund' AND refund_of_transaction_id=$1",[transaction])).rowCount).toBe(0);
 });
 it('HD lost-row direct failure refunds once and leaves a linked receipt',async()=>{
  const id=await user();await query('UPDATE users SET rune_balance=70 WHERE id=$1',[id]);
  const spend=(await query("INSERT INTO rune_transactions(user_id,type,amount,balance_after,description,action_type) VALUES($1,'spend',-30,70,'Synthetic HD report','HD_REPORT') RETURNING id",[id])).rows[0].id as string;
  expect(await shouldRefundBeforeWorkerFail(new NextRequest('http://localhost/api/human-design/report'),'report_row_lost')).toBe(true);
  const result=await BillingService.rollbackChargeEx({userId:id,cost:30,wasFreeQuestion:false,transactionId:spend,actionType:'HD_REPORT',slotReserved:false});
  expect(result).toMatchObject({balance:100,refunded:true});
  expect((await query("SELECT amount,balance_after FROM rune_transactions WHERE type='refund' AND refund_of_transaction_id=$1",[spend])).rows[0]).toMatchObject({amount:30,balance_after:100});
  const route=readFileSync('src/app/api/human-design/report/route.ts','utf8');
  expect(route).toContain('shouldRefundBeforeWorkerFail(request, "report_row_lost")');
 });
 it('HD composite snapshot orientation follows stored chart IDs, not request ordering',async()=>{
  const id=await user();const charts=[await hdChart(id),await hdChart(id,'1985-04-03')].sort((a,b)=>b.id.localeCompare(a.id));
  const report=await createPendingCompositeReport({userId:id,baseChartId:charts[0].id,partnerChartId:charts[1].id,transactionId:null});expect(report).not.toBeNull();
  await completeCompositeReport(report!.id,'Pair saved text','fixture',charts[0],charts[1]);
  await query("UPDATE hd_charts SET chart='{}',engine_version='future' WHERE user_id=$1",[id]);
  const saved=await getHdCompositeReportById(report!.id,id);expect(saved?.baseSnapshot).toEqual(charts.find(c=>c.id===saved.baseChartId));expect(saved?.partnerSnapshot).toEqual(charts.find(c=>c.id===saved.partnerChartId));
 });

});
