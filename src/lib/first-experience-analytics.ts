import { query } from "@/lib/db";
import { isFirstExperienceEnabled } from "@/lib/first-experience-policy";
import { testAccountEmailSql, testProfileNameSql } from "@/lib/test-accounts";

/** Ledger purchases are the authority. Bonus spends are never ruble revenue. */
export async function getFirstExperienceAnalytics() {
  if(!isFirstExperienceEnabled())return null;
  const {rows}=await query<{day:string;version:string;users:string;mature7:string;paid7:string;mature30:string;paid30:string;payers:string;repeat:string}>(`WITH cohort AS (
    SELECT u.id,MIN(ua.created_at) AS registered_at,COALESCE(u.starter_bonus_version,'legacy') AS version
    FROM users u JOIN user_accounts ua ON ua.profile_user_id=u.id
    WHERE NOT COALESCE(${testAccountEmailSql("ua.email")},false) AND NOT COALESCE(${testProfileNameSql("u.name")},false)
    GROUP BY u.id,u.starter_bonus_version
  ), payments AS (SELECT user_id,MIN(created_at) AS first_at,COUNT(*) AS purchases FROM rune_transactions WHERE type='purchase' AND amount>0 AND payment_id IS NOT NULL GROUP BY user_id)
  SELECT (c.registered_at AT TIME ZONE 'UTC')::date::text AS day,c.version,COUNT(*)::text AS users,
    COUNT(*) FILTER(WHERE c.registered_at<=NOW()-INTERVAL '7 days')::text AS mature7,
    COUNT(*) FILTER(WHERE c.registered_at<=NOW()-INTERVAL '7 days' AND p.first_at>=c.registered_at AND p.first_at<c.registered_at+INTERVAL '7 days')::text AS paid7,
    COUNT(*) FILTER(WHERE c.registered_at<=NOW()-INTERVAL '30 days')::text AS mature30,
    COUNT(*) FILTER(WHERE c.registered_at<=NOW()-INTERVAL '30 days' AND p.first_at>=c.registered_at AND p.first_at<c.registered_at+INTERVAL '30 days')::text AS paid30,
    COUNT(*) FILTER(WHERE p.purchases>0)::text AS payers,COUNT(*) FILTER(WHERE p.purchases>1)::text AS repeat
    FROM cohort c LEFT JOIN payments p ON p.user_id=c.id GROUP BY day,c.version ORDER BY day DESC LIMIT 90`);
  const cohorts=rows.map(r=>({day:r.day,version:r.version,users:Number(r.users),eligible7:Number(r.mature7),eligible30:Number(r.mature30),firstPayment7:Number(r.mature7)>0?Number(r.paid7)/Number(r.mature7):null,firstPayment30:Number(r.mature30)>0?Number(r.paid30)/Number(r.mature30):null,repeatPayment:Number(r.payers)>0?Number(r.repeat)/Number(r.payers):null}));
  const costs=await query<{known:string|null;unknown:string;tracked:string}>(`SELECT SUM(j.llm_cost_rub*LEAST(1,(m.metadata->>'runes')::numeric/NULLIF(-t.amount,0)))::text AS known,
    COUNT(*) FILTER(WHERE j.id IS NULL OR j.llm_cost_rub IS NULL)::text AS unknown,
    COUNT(*) FILTER(WHERE j.llm_cost_rub IS NOT NULL)::text AS tracked
    FROM spread_metrics m JOIN rune_transactions t ON t.id::text=m.idempotency_key JOIN users u ON u.id=m.user_id
    JOIN user_accounts ua ON ua.profile_user_id=u.id LEFT JOIN async_jobs j ON j.charge_transaction_id=t.id
    WHERE m.event='bonus_spent' AND NOT COALESCE(${testAccountEmailSql("ua.email")},false) AND NOT COALESCE(${testProfileNameSql("u.name")},false)`);
  const cost=costs.rows[0];
  const events=await query<{event:string;count:string}>(`SELECT m.event,COUNT(*)::text AS count FROM spread_metrics m JOIN users u ON u.id=m.user_id JOIN user_accounts ua ON ua.profile_user_id=u.id WHERE m.source='first_experience' AND NOT COALESCE(${testAccountEmailSql("ua.email")},false) AND NOT COALESCE(${testProfileNameSql("u.name")},false) GROUP BY m.event ORDER BY m.event`);
  return {events:events.rows.map(r=>({event:r.event,count:Number(r.count)})),cohorts,freeGenerationCost:{knownRub:cost?.known==null?null:Number(cost.known),untracked:Number(cost?.unknown??0),tracked:Number(cost?.tracked??0),totalRub:cost?.known!=null && Number(cost.unknown)===0?Number(cost.known):null},definitions:{firstPayment:"Подтверждённое пополнение. В знаменателе только аккаунты с полными 7/30 днями наблюдения.",repeatPayment:"Доля плательщиков с двумя и более подтверждёнными пополнениями за всё доступное время.",freeCost:"Фактическая стоимость LLM в очереди, в доле потраченного подарка. Синхронные генерации без учёта стоимости обозначены как неизвестные. Это расходы, не выручка."}};
}
