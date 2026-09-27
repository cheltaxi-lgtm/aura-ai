import { query } from "@/lib/db";
import { testAccountEmailSql } from "@/lib/test-accounts";
import { isAuraReadingEnabled, isPalmReadingEnabled } from "@/lib/settings";
import type { ActivationStage } from "@/lib/activation-status";

export type ActivationContinuation = {product:"aura"|"palm";href:string;label:string};

/** Trusted SQL alias only; account rows must already be ownership/admin scoped. */
export function savedProductResultSql(profileId: string): string {
  return `(
    EXISTS(SELECT 1 FROM history h WHERE h.user_id=${profileId}
      AND (length(btrim(COALESCE(h.context_data->>'reading',''))) > 0
        OR length(btrim(COALESCE(h.context_data->>'report',''))) > 0
        OR length(btrim(COALESCE(h.context_data->>'interpretation',''))) > 0))
    OR EXISTS(SELECT 1 FROM daily_readings r WHERE r.user_id=${profileId} AND length(btrim(r.reading_text))>0)
    OR EXISTS(SELECT 1 FROM sessions s JOIN chat_messages c ON c.session_id=s.id
      WHERE s.user_id=${profileId} AND (c.owner_user_id=${profileId} OR c.owner_user_id IS NULL)
        AND c.role='assistant' AND length(btrim(c.content))>0
        AND EXISTS(SELECT 1 FROM chat_messages question WHERE question.session_id=s.id
          AND question.role='user' AND length(btrim(question.content))>0
          AND (question.owner_user_id=${profileId} OR question.owner_user_id IS NULL)
          AND question.created_at<=c.created_at))
    OR EXISTS(SELECT 1 FROM natal_report_history r WHERE r.user_id=${profileId} AND length(btrim(r.content))>0)
    OR EXISTS(SELECT 1 FROM numerology_report_history r WHERE r.user_id=${profileId} AND length(btrim(r.content))>0)
    OR EXISTS(SELECT 1 FROM hd_reports r WHERE r.user_id=${profileId} AND r.status='done' AND length(btrim(r.report_text))>0)
  )`;
}

export function activationStageSql(profileId: string): string {
  return `CASE
    WHEN ${profileId} IS NULL THEN 'profile_missing'
    WHEN ${savedProductResultSql(profileId)} THEN 'result_ready'
    WHEN EXISTS(SELECT 1 FROM async_jobs j WHERE j.user_id=${profileId})
      OR EXISTS(SELECT 1 FROM spread_metrics m WHERE m.user_id=${profileId}
        AND ((m.source='activation_funnel' AND m.event='request_attempted')
          OR (m.source='product_activity' AND m.event IN('request_started','chat_message_sent')))) THEN 'started'
    WHEN EXISTS(SELECT 1 FROM aura_guest_snapshots g WHERE g.claimed_user_id=${profileId})
      OR EXISTS(SELECT 1 FROM palm_guest_snapshots g WHERE g.claimed_user_id=${profileId}) THEN 'preview_only'
    ELSE 'not_started' END`;
}

export async function getActivationDiagnostics() {
  const scope=`FROM user_accounts ua LEFT JOIN users u ON u.id=ua.profile_user_id
    WHERE NOT ${testAccountEmailSql("ua.email")} AND NOT ua.is_internal AND NOT ua.is_unlimited
      AND ua.erasure_requested_at IS NULL AND u.erasure_requested_at IS NULL`;
  const stages=await query<{stage:string;accounts:string}>(`WITH accounts AS (
    SELECT ${activationStageSql("u.id")} AS stage ${scope}) SELECT stage,COUNT(*)::text AS accounts FROM accounts GROUP BY stage ORDER BY accounts DESC`);
  const events=await query<{product:string;event:string;code:string;requests:string;accounts:string}>(`WITH accounts AS (SELECT u.id ${scope})
    SELECT m.spread_id AS product,m.event,COALESCE(m.metadata->>'code','') AS code,
      COUNT(*)::text AS requests,COUNT(DISTINCT m.user_id)::text AS accounts
    FROM spread_metrics m JOIN accounts a ON a.id=m.user_id
    WHERE m.source='activation_funnel' AND m.created_at>=NOW()-INTERVAL '30 days'
    GROUP BY m.spread_id,m.event,m.metadata->>'code' ORDER BY product,event,code`);
  return {stages:stages.rows.map(r=>({stage:r.stage,accounts:Number(r.accounts)})),events:events.rows.map(r=>({...r,requests:Number(r.requests),accounts:Number(r.accounts)}))};
}

export async function getUserActivationContext(profileUserId: string): Promise<{stage:ActivationStage;continuation:ActivationContinuation|null}|null> {
  const {rows}=await query<{stage:ActivationStage}>(`SELECT ${activationStageSql("u.id")} AS stage FROM users u
    JOIN user_accounts ua ON ua.profile_user_id=u.id WHERE u.id=$1 AND ua.erasure_requested_at IS NULL AND u.erasure_requested_at IS NULL`,[profileUserId]);
  if (!rows[0]) return null;
  const [auraEnabled,palmEnabled]=await Promise.all([isAuraReadingEnabled(),isPalmReadingEnabled()]);
  const previews=await query<{id:string;product:"aura"|"palm"}>(`SELECT g.id,'aura' AS product,g.claimed_at FROM aura_guest_snapshots g
      WHERE g.claimed_user_id=$1 AND $2::boolean AND NOT EXISTS(SELECT 1 FROM history h WHERE h.user_id=$1 AND h.context_data->>'auraSnapshotId'=g.id::text AND length(btrim(COALESCE(h.context_data->>'report','')))>0)
    UNION ALL SELECT g.id,'palm' AS product,g.claimed_at FROM palm_guest_snapshots g
      WHERE g.claimed_user_id=$1 AND $3::boolean AND NOT EXISTS(SELECT 1 FROM history h WHERE h.user_id=$1 AND h.context_data->>'palmSnapshotId'=g.id::text AND length(btrim(COALESCE(h.context_data->>'report','')))>0)
    ORDER BY claimed_at DESC LIMIT 1`,[profileUserId,auraEnabled,palmEnabled]);
  let continuation: ActivationContinuation|null=null;
  for(const row of previews.rows){
    {
      continuation={product:row.product,href:`${row.product==='aura'?'/aura':'/gadanie-po-ladoni'}?reading=${encodeURIComponent(row.id)}`,
        label:row.product==='aura'?'Продолжить разбор ауры':'Продолжить разбор ладони'};
      break;
    }
  }
  return {stage:rows[0].stage,continuation};
}
