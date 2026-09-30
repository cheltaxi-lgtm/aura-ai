/** Read-only, aggregate production audit. Never print account data or reading text. */
import { getPool } from "../src/lib/db";
import { testAccountEmailSql } from "../src/lib/test-accounts";

const external = `SELECT u.id AS user_id FROM user_accounts ua
  JOIN users u ON u.id=ua.profile_user_id
  WHERE NOT ${testAccountEmailSql("ua.email")}
    AND ua.email NOT ILIKE '%@example.%' AND ua.email NOT ILIKE '%+test@%'
    AND NOT ua.is_internal AND NOT ua.is_unlimited
    AND ua.erasure_requested_at IS NULL AND u.erasure_requested_at IS NULL`;

async function main() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='30s'");
    const daily = await client.query(`WITH external AS (${external}), rows AS (
      SELECT dr.user_id,dr.reading_date,dr.reading_text AS body,dr.cards,dr.deck_system,
        regexp_replace(lower(left(dr.reading_text,120)), '\\s+', ' ', 'g') AS opening,
        (SELECT COUNT(*)::int FROM jsonb_array_elements(COALESCE(dr.cards,'[]'::jsonb)) card
         WHERE length(card->>'name')>0 AND strpos(lower(dr.reading_text),lower(card->>'name'))>0) AS named_cards,
        jsonb_array_length(COALESCE(dr.cards,'[]'::jsonb)) AS card_count
      FROM daily_readings dr JOIN external e ON e.user_id=dr.user_id
      WHERE dr.reading_date>=CURRENT_DATE-90 AND length(btrim(dr.reading_text))>0
    ) SELECT COUNT(*)::int AS readings,COUNT(DISTINCT user_id)::int AS users,
      COUNT(*) FILTER(WHERE reading_date>=CURRENT_DATE-30)::int AS readings_30d,
      COUNT(DISTINCT user_id) FILTER(WHERE reading_date>=CURRENT_DATE-30)::int AS users_30d,
      percentile_cont(0.5) WITHIN GROUP(ORDER BY length(body))::int AS median_chars,
      percentile_cont(0.9) WITHIN GROUP(ORDER BY length(body))::int AS p90_chars,
      COUNT(*) FILTER(WHERE length(body)>1500)::int AS over_1500,
      COUNT(*) FILTER(WHERE length(body)>2500)::int AS over_2500,
      COUNT(*) FILTER(WHERE lower(body) LIKE '%утро%' AND lower(body) LIKE '%день%'
        AND lower(body) LIKE '%вечер%')::int AS names_all_dayparts,
      COUNT(*) FILTER(WHERE named_cards=card_count)::int AS all_cards_named,
      COUNT(*) FILTER(WHERE named_cards=0)::int AS no_card_named,
      COUNT(*) FILTER(WHERE body LIKE '%## Простыми словами%')::int AS paid_heading_leak,
      COUNT(*) FILTER(WHERE lower(body) LIKE '%оплаченн%')::int AS paid_word_leak,
      COUNT(*) FILTER(WHERE lower(body) LIKE '%энергия дня%')::int AS energy_day_phrase,
      COUNT(DISTINCT opening)::int AS distinct_openings
      FROM rows`);
    const dailyDecks = await client.query(`WITH external AS (${external})
      SELECT dr.deck_system,COUNT(*)::int AS readings,COUNT(DISTINCT dr.user_id)::int AS users,
        COUNT(*) FILTER(WHERE jsonb_array_length(COALESCE(dr.cards,'[]'::jsonb))=3)::int AS three_cards
      FROM daily_readings dr JOIN external e ON e.user_id=dr.user_id
      WHERE dr.reading_date>=CURRENT_DATE-90 AND length(btrim(dr.reading_text))>0
      GROUP BY dr.deck_system ORDER BY readings DESC`);
    const dailyConcentration = await client.query(`WITH external AS (${external}), usage AS (
      SELECT dr.user_id,COUNT(*)::int AS readings FROM daily_readings dr
      JOIN external e ON e.user_id=dr.user_id
      WHERE dr.reading_date>=CURRENT_DATE-90 AND length(btrim(dr.reading_text))>0
      GROUP BY dr.user_id)
      SELECT COUNT(*)::int AS users,
        COUNT(*) FILTER(WHERE readings=1)::int AS once,
        COUNT(*) FILTER(WHERE readings>=2)::int AS repeated,
        MAX(readings)::int AS max_per_user,
        (SELECT COALESCE(SUM(readings),0)::int FROM
          (SELECT readings FROM usage ORDER BY readings DESC LIMIT 3) top3) AS top3_readings
      FROM usage`);
    const kinds = await client.query(`WITH external AS (${external}), rows AS (
      SELECT CASE h.context_data->>'type'
        WHEN 'photo_reading' THEN 'photo' WHEN 'aura_reading' THEN 'aura'
        WHEN 'palm_reading' THEN 'palm' WHEN 'daily_reading' THEN 'daily'
        WHEN 'intention_spread' THEN 'intention' ELSE 'other' END AS kind,
        COALESCE(NULLIF(h.context_data->>'report',''),NULLIF(h.context_data->>'reading',''),
          NULLIF(h.context_data->>'interpretation',''),NULLIF(h.context_data->>'analysis','')) AS body
      FROM history h JOIN external e ON e.user_id=h.user_id
      WHERE h.created_at>=NOW()-INTERVAL '90 days'
    ) SELECT kind,COUNT(*)::int AS rows,
      COUNT(*) FILTER(WHERE body IS NOT NULL)::int AS with_text,
      percentile_cont(0.5) WITHIN GROUP(ORDER BY length(body))::int AS median_chars,
      COUNT(*) FILTER(WHERE length(body)>5000)::int AS over_5000,
      COUNT(*) FILTER(WHERE body LIKE '%## Простыми словами%')::int AS simply_words
      FROM rows GROUP BY kind ORDER BY rows DESC`);
    const feedback = await client.query(`WITH external AS (${external})
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER(WHERE useful)::int AS useful,
        COUNT(*) FILTER(WHERE NOT useful)::int AS not_useful
      FROM reading_feedback f JOIN external e ON e.user_id=f.user_id
      WHERE f.created_at>=NOW()-INTERVAL '90 days'`);
    const guest = await client.query(`SELECT guest_resume_status AS status,COUNT(*)::int AS sessions
      FROM sessions WHERE guest_resume_token_hash IS NOT NULL
        AND created_at>=NOW()-INTERVAL '90 days'
      GROUP BY guest_resume_status ORDER BY sessions DESC`);
    await client.query("ROLLBACK");
    console.log(JSON.stringify({ at:new Date().toISOString(),daily:daily.rows[0],dailyConcentration:dailyConcentration.rows[0],dailyDecks:dailyDecks.rows,kinds:kinds.rows,feedback:feedback.rows[0],guestReceipts:guest.rows }));
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((error) => { console.error("audit_failed",String(error.code??error.message).slice(0,100));process.exitCode=1; });
