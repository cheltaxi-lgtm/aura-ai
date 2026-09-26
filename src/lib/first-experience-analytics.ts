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
    HAVING MIN(ua.created_at)>=DATE_TRUNC('day',NOW())-INTERVAL '89 days'
  ), payments AS (SELECT user_id,MIN(created_at) AS first_at,COUNT(*) AS purchases FROM rune_transactions WHERE type='purchase' AND amount>0 AND payment_id IS NOT NULL GROUP BY user_id)
  SELECT (c.registered_at AT TIME ZONE 'UTC')::date::text AS day,c.version,COUNT(*)::text AS users,
    COUNT(*) FILTER(WHERE c.registered_at<=NOW()-INTERVAL '7 days')::text AS mature7,
    COUNT(*) FILTER(WHERE c.registered_at<=NOW()-INTERVAL '7 days' AND p.first_at>=c.registered_at AND p.first_at<c.registered_at+INTERVAL '7 days')::text AS paid7,
    COUNT(*) FILTER(WHERE c.registered_at<=NOW()-INTERVAL '30 days')::text AS mature30,
    COUNT(*) FILTER(WHERE c.registered_at<=NOW()-INTERVAL '30 days' AND p.first_at>=c.registered_at AND p.first_at<c.registered_at+INTERVAL '30 days')::text AS paid30,
    COUNT(*) FILTER(WHERE p.purchases>0)::text AS payers,COUNT(*) FILTER(WHERE p.purchases>1)::text AS repeat
    FROM cohort c LEFT JOIN payments p ON p.user_id=c.id GROUP BY day,c.version ORDER BY day DESC`);
  const cohorts=rows.map(r=>({
    day:r.day,
    version:r.version,
    users:Number(r.users),
    eligible7:Number(r.mature7),
    paid7:Number(r.paid7),
    eligible30:Number(r.mature30),
    paid30:Number(r.paid30),
    payers:Number(r.payers),
    repeatPayers:Number(r.repeat),
    firstPayment7:Number(r.mature7)>0?Number(r.paid7)/Number(r.mature7):null,
    firstPayment30:Number(r.mature30)>0?Number(r.paid30)/Number(r.mature30):null,
    repeatPayment:Number(r.payers)>0?Number(r.repeat)/Number(r.payers):null,
  }));
  const summary=cohorts.reduce((total,row)=>({
    registrations:total.registrations+row.users,
    eligible7:total.eligible7+row.eligible7,
    paid7:total.paid7+row.paid7,
    eligible30:total.eligible30+row.eligible30,
    paid30:total.paid30+row.paid30,
    payers:total.payers+row.payers,
    repeatPayers:total.repeatPayers+row.repeatPayers,
  }),{registrations:0,eligible7:0,paid7:0,eligible30:0,paid30:0,payers:0,repeatPayers:0});
  const costs=await query<{known:string|null;unknown:string;tracked:string}>(`WITH scoped_users AS (
    SELECT u.id FROM users u JOIN user_accounts ua ON ua.profile_user_id=u.id
    WHERE NOT COALESCE(${testAccountEmailSql("ua.email")},false) AND NOT COALESCE(${testProfileNameSql("u.name")},false)
    GROUP BY u.id HAVING MIN(ua.created_at)>=DATE_TRUNC('day',NOW())-INTERVAL '89 days'
  )
    SELECT SUM(j.llm_cost_rub*LEAST(1,(m.metadata->>'runes')::numeric/NULLIF(-t.amount,0)))::text AS known,
    COUNT(*) FILTER(WHERE j.id IS NULL OR j.llm_cost_rub IS NULL)::text AS unknown,
    COUNT(*) FILTER(WHERE j.llm_cost_rub IS NOT NULL)::text AS tracked
    FROM spread_metrics m JOIN rune_transactions t ON t.id::text=m.idempotency_key JOIN scoped_users u ON u.id=m.user_id
    LEFT JOIN async_jobs j ON j.charge_transaction_id=t.id WHERE m.source='first_experience' AND m.event='bonus_spent'`);
  const cost=costs.rows[0];
  const events=await query<{event:string;count:string}>(`WITH scoped_users AS (
    SELECT u.id FROM users u JOIN user_accounts ua ON ua.profile_user_id=u.id
    WHERE NOT COALESCE(${testAccountEmailSql("ua.email")},false) AND NOT COALESCE(${testProfileNameSql("u.name")},false)
    GROUP BY u.id HAVING MIN(ua.created_at)>=DATE_TRUNC('day',NOW())-INTERVAL '89 days'
  )
  SELECT m.event,COUNT(DISTINCT m.user_id)::text AS count FROM spread_metrics m JOIN scoped_users u ON u.id=m.user_id
  WHERE m.source='first_experience' GROUP BY m.event ORDER BY m.event`);
  const funnel=await query<{event:string;count:string}>(`WITH scoped_users AS (
    SELECT u.id FROM users u JOIN user_accounts ua ON ua.profile_user_id=u.id
    WHERE NOT COALESCE(${testAccountEmailSql("ua.email")},false) AND NOT COALESCE(${testProfileNameSql("u.name")},false)
    GROUP BY u.id HAVING MIN(ua.created_at)>=DATE_TRUNC('day',NOW())-INTERVAL '89 days'
  ), user_events AS (
    SELECT u.id AS user_id,
      bonus_granted.at AS bonus_granted_at,
      bonus_spent.at AS bonus_spent_at,
      first_result.at AS first_result_at,
      continuation_shown.at AS continuation_shown_at,
      payment_started.at AS payment_started_at,
      first_topup.at AS first_topup_at
    FROM scoped_users u
    LEFT JOIN LATERAL (SELECT MIN(created_at) AS at FROM spread_metrics WHERE user_id=u.id AND source='first_experience' AND event='bonus_granted') bonus_granted ON TRUE
    LEFT JOIN LATERAL (SELECT MIN(created_at) AS at FROM spread_metrics WHERE user_id=u.id AND source='first_experience' AND event='bonus_spent' AND created_at>=bonus_granted.at) bonus_spent ON bonus_granted.at IS NOT NULL
    LEFT JOIN LATERAL (SELECT MIN(created_at) AS at FROM spread_metrics WHERE user_id=u.id AND source='first_experience' AND event='first_result' AND created_at>=bonus_spent.at) first_result ON bonus_spent.at IS NOT NULL
    LEFT JOIN LATERAL (SELECT MIN(created_at) AS at FROM spread_metrics WHERE user_id=u.id AND source='first_experience' AND event='continuation_shown' AND created_at>=first_result.at) continuation_shown ON first_result.at IS NOT NULL
    LEFT JOIN LATERAL (SELECT MIN(created_at) AS at FROM spread_metrics WHERE user_id=u.id AND source='first_experience' AND event='payment_started' AND created_at>=continuation_shown.at) payment_started ON continuation_shown.at IS NOT NULL
    LEFT JOIN LATERAL (SELECT MIN(created_at) AS at FROM spread_metrics WHERE user_id=u.id AND source='first_experience' AND event='first_topup' AND created_at>=payment_started.at) first_topup ON payment_started.at IS NOT NULL
  )
  SELECT 'bonus_granted' AS event,COUNT(*) FILTER(WHERE bonus_granted_at IS NOT NULL)::text AS count FROM user_events
  UNION ALL SELECT 'bonus_spent',COUNT(*) FILTER(WHERE bonus_spent_at IS NOT NULL)::text FROM user_events
  UNION ALL SELECT 'first_result',COUNT(*) FILTER(WHERE first_result_at IS NOT NULL)::text FROM user_events
  UNION ALL SELECT 'continuation_shown',COUNT(*) FILTER(WHERE continuation_shown_at IS NOT NULL)::text FROM user_events
  UNION ALL SELECT 'payment_started',COUNT(*) FILTER(WHERE payment_started_at IS NOT NULL)::text FROM user_events
  UNION ALL SELECT 'first_topup',COUNT(*) FILTER(WHERE first_topup_at IS NOT NULL)::text FROM user_events`);
  const guestRegistrationFunnel=await query<{event:string;count:string}>(`WITH receipts AS (
    SELECT spread_id,MIN(created_at) AS receipt_issued_at
    FROM spread_metrics
    WHERE source='guest_registration_funnel'
      AND event='receipt_issued'
      AND created_at>=DATE_TRUNC('day',NOW())-INTERVAL '29 days'
    GROUP BY spread_id
  ), receipt_events AS (
    SELECT r.spread_id,r.receipt_issued_at,
      auth_started.at AS auth_started_at,
      account_created.at AS account_created_at,
      claim_succeeded.at AS claim_succeeded_at
    FROM receipts r
    LEFT JOIN LATERAL (
      SELECT MIN(created_at) AS at FROM spread_metrics
      WHERE source='guest_registration_funnel' AND spread_id=r.spread_id
        AND event='auth_started' AND created_at>=r.receipt_issued_at
    ) auth_started ON TRUE
    LEFT JOIN LATERAL (
      SELECT MIN(created_at) AS at FROM spread_metrics
      WHERE source='guest_registration_funnel' AND spread_id=r.spread_id
        AND event='account_created' AND created_at>=auth_started.at
    ) account_created ON auth_started.at IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT MIN(created_at) AS at FROM spread_metrics
      WHERE source='guest_registration_funnel' AND spread_id=r.spread_id
        AND event='claim_succeeded' AND created_at>=account_created.at
    ) claim_succeeded ON account_created.at IS NOT NULL
  )
  SELECT 'receipt_issued' AS event,COUNT(*)::text AS count FROM receipt_events
  UNION ALL SELECT 'auth_started',COUNT(*) FILTER(WHERE auth_started_at IS NOT NULL)::text FROM receipt_events
  UNION ALL SELECT 'account_created',COUNT(*) FILTER(WHERE account_created_at IS NOT NULL)::text FROM receipt_events
  UNION ALL SELECT 'claim_succeeded',COUNT(*) FILTER(WHERE claim_succeeded_at IS NOT NULL)::text FROM receipt_events`);
  const guestRegistrationDiagnostics=await query<{event:string;count:string}>(`SELECT event,COUNT(DISTINCT spread_id)::text AS count
    FROM spread_metrics
    WHERE source='guest_registration_funnel'
      AND event IN ('receipt_reused','claim_failed')
      AND created_at>=DATE_TRUNC('day',NOW())-INTERVAL '29 days'
    GROUP BY event`);
  const checkout=await query<{event:string;code:string;requests:string;users:string}>(`WITH external_users AS (
    SELECT DISTINCT u.id FROM users u JOIN user_accounts ua ON ua.profile_user_id=u.id
    WHERE ua.is_internal=FALSE AND ua.is_unlimited=FALSE
      AND ua.erasure_requested_at IS NULL AND u.erasure_requested_at IS NULL
      AND NOT COALESCE(${testAccountEmailSql("ua.email")},false)
      AND NOT COALESCE(${testProfileNameSql("u.name")},false)
      AND NOT COALESCE(ua.email ILIKE '%@example.%',false)
      AND NOT COALESCE(ua.email ILIKE '%+test@%',false)
  )
  SELECT m.event,COALESCE(m.metadata->>'errorCode','') AS code,
    COUNT(*)::text AS requests,COUNT(DISTINCT m.user_id)::text AS users
  FROM spread_metrics m JOIN external_users u ON u.id=m.user_id
  WHERE m.source='first_experience' AND m.event IN ('payment_attempted','payment_started','payment_failed')
    AND m.created_at>=NOW()-INTERVAL '30 days'
  GROUP BY m.event,code
  UNION ALL SELECT 'payment_confirmed','',COUNT(*)::text,COUNT(DISTINCT t.user_id)::text
  FROM rune_transactions t JOIN external_users u ON u.id=t.user_id
  WHERE t.type='purchase' AND t.amount>0 AND t.payment_id IS NOT NULL AND t.created_at>=NOW()-INTERVAL '30 days'`);
  return {
    checkout:{days:30,stages:checkout.rows.map(r=>({event:r.event,code:r.code,requests:Number(r.requests),users:Number(r.users)}))},
    events:events.rows.map(r=>({event:r.event,count:Number(r.count)})),
    funnel:funnel.rows.map(r=>({event:r.event,count:Number(r.count)})),
    guestRegistration:{
      days:30,
      funnel:guestRegistrationFunnel.rows.map(r=>({event:r.event,count:Number(r.count)})),
      diagnostics:guestRegistrationDiagnostics.rows.map(r=>({event:r.event,count:Number(r.count)})),
    },
    cohorts,
    summary:{
      ...summary,
      firstPayment7:summary.eligible7>0?summary.paid7/summary.eligible7:null,
      firstPayment30:summary.eligible30>0?summary.paid30/summary.eligible30:null,
      repeatPayment:summary.payers>0?summary.repeatPayers/summary.payers:null,
    },
    freeGenerationCost:{knownRub:cost?.known==null?null:Number(cost.known),untracked:Number(cost?.unknown??0),tracked:Number(cost?.tracked??0),totalRub:cost?.known!=null && Number(cost.unknown)===0?Number(cost.known):null},
    definitions:{firstPayment:"Подтверждённое пополнение. В знаменателе только аккаунты с полными 7/30 днями наблюдения.",repeatPayment:"Доля плательщиков с двумя и более подтверждёнными пополнениями среди регистраций последних 90 дней.",freeCost:"Фактическая стоимость LLM для регистраций последних 90 дней, в доле потраченного подарка. Синхронные генерации без учёта стоимости обозначены как неизвестные. Это расходы, не выручка.",guestRegistration:"Серверная воронка последних 30 дней по сохранённым гостевым раскладам. Этапы считаются только в правильной последовательности и не зависят от согласия на Метрику."},
  };
}
