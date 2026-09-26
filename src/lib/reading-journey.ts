import { query, queryClient, withTransaction } from "@/lib/db";
import { getSavedReadingDocument } from "@/lib/reports/saved-reading";
import { resolveCrossProductRecommendations, type CrossProductContext } from "@/lib/cross-product-recommendations";
import { getRuneSettings } from "@/lib/rune-settings";
import { isAuraReadingEnabled, isPalmReadingEnabled, isNatalChartEnabled, isHumanDesignEnabled } from "@/lib/settings";
import type { RuneActionType } from "@/lib/rune-costs";

import { recordJourneyEvent } from "@/lib/spread-metrics-store";
import { recordProductActivity } from "@/lib/product-activity";

export const JOURNEY_SOURCES_SQL = `
  SELECT id,created_at,CASE context_data->>'type' WHEN 'aura_reading' THEN 'aura' WHEN 'palm_reading' THEN 'palm' WHEN 'photo_reading' THEN 'photo' ELSE 'tarot' END AS kind
    FROM history WHERE user_id=$1 AND COALESCE(NULLIF(context_data->>'report',''),NULLIF(context_data->>'reading',''),NULLIF(context_data->>'interpretation',''),NULLIF(context_data->>'analysis','')) IS NOT NULL
  UNION ALL SELECT id,created_at,CASE WHEN tool_id='matrix_compatibility' THEN 'matrix_compatibility' WHEN tool_id='destiny_matrix' THEN 'matrix' ELSE 'numerology' END FROM numerology_report_history WHERE user_id=$1 AND length(trim(content))>0
  UNION ALL SELECT id,created_at,'natal' FROM natal_report_history WHERE user_id=$1 AND length(trim(content))>0
  UNION ALL SELECT id,created_at,'natal' FROM natal_compatibility_reports WHERE (owner_user_id=$1 OR participant_user_id=$1) AND status='completed' AND report_data IS NOT NULL
  UNION ALL SELECT id,created_at,'human_design' FROM hd_reports WHERE user_id=$1 AND status='done' AND length(trim(report_text))>0
  UNION ALL SELECT id,created_at,'human_design' FROM hd_composite_reports WHERE user_id=$1 AND status='done' AND length(trim(report_text))>0
  UNION ALL SELECT id,created_at,'ritual' FROM rituals WHERE user_id=$1 AND status IN ('completed','reviewed')
  UNION ALL SELECT s.id,MAX(m.created_at),'tarot' FROM sessions s JOIN chat_messages m ON m.session_id=s.id WHERE s.user_id=$1 AND (m.owner_user_id=$1 OR m.owner_user_id IS NULL) AND m.role='assistant' AND length(trim(m.content))>0 AND EXISTS(SELECT 1 FROM chat_messages question WHERE question.session_id=s.id AND question.role='user' AND (question.owner_user_id=$1 OR question.owner_user_id IS NULL) AND question.created_at<=m.created_at) GROUP BY s.id
  UNION ALL SELECT id,reading_date::timestamptz,'tarot' FROM daily_readings WHERE user_id=$1 AND length(trim(reading_text))>0`;

const ACTIONS: Record<string,RuneActionType> = { matrix:"NUMEROLOGY_SESSION", natal:"NATAL_READING", human_design:"HD_REPORT", matrix_compatibility:"MATRIX_PAIR_REPORT", aura:"AURA_READING", palm:"PALM_READING", photo:"VISION_ANALYSIS" };
const BENEFITS: Record<string,string> = { matrix:"Посмотрите на свои сильные стороны и привычные способы действовать.", natal:"Исследуйте личные особенности через дату, время и место рождения.", human_design:"Посмотрите на свой подход к решениям и распределению сил.", matrix_compatibility:"Обсудите различия и точки взаимопонимания в паре.", aura:"Получите символический портрет состояния по новой фотографии.", palm:"Исследуйте особенности ладони и вопросы для самостоятельного размышления.", photo:"Загрузите новый расклад или задайте вопрос к тем же картам в сохранённом разборе." };
export type JourneyNote = { entry_text: string; weekly_step: string; reflection: string; reminder_consent_at: string | null; reminder_timezone: string | null; reminder_channel: "email" | "telegram" | null };

export async function getReadingJourney(userId: string, requestedId?: string) {
  const sources = await query<{id:string;created_at:Date;kind:string}>(`WITH readings AS (${JOURNEY_SOURCES_SQL}) SELECT * FROM (
    (SELECT DISTINCT ON(kind) * FROM readings ORDER BY kind,created_at DESC,id DESC)
    UNION (SELECT * FROM readings WHERE id=$2::uuid)
    UNION (SELECT * FROM readings ORDER BY created_at,id LIMIT 1)
  ) selected ORDER BY created_at DESC,id DESC`,[userId,requestedId??null]);
  const source = requestedId ? sources.rows.find(r=>r.id===requestedId) : sources.rows[0];
  if (!source) return null;
  const doc = await getSavedReadingDocument(userId,source.id);
  if (!doc?.body.trim()) return null;
  await recordProductActivity(userId,"result_viewed",source.id,{product:source.kind});
  const first=sources.rows[sources.rows.length-1];
  await query(`INSERT INTO spread_metrics(user_id,event,spread_id,source,idempotency_key,metadata,created_at)
    VALUES($1,'first_result','journey','first_experience','first',jsonb_build_object('product',$2::text),$3)
    ON CONFLICT(user_id,event,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,[userId,first.kind,first.created_at]);
  const note = await query<JourneyNote>(`SELECT entry_text,weekly_step,reflection,reminder_consent_at,reminder_timezone,reminder_channel FROM diary_entries WHERE user_id=$1 AND reading_id=$2`,[userId,source.id]);
  const owned = new Set(sources.rows.map(r=>r.kind));
  const pending=await query<{kind:string}>("SELECT DISTINCT kind FROM async_jobs WHERE user_id=$1 AND status IN ('pending','running') AND billing_state='charged'",[userId]);
  const pendingProducts:Record<string,string>={natal_interpretation:"natal",hd_report:"human_design",hd_composite_report:"human_design",numerology_reading:"matrix",aura_reading:"aura",palm_reading:"palm",photo_reading:"photo"};
  for(const job of pending.rows)if(pendingProducts[job.kind])owned.add(pendingProducts[job.kind]);
  const context = (["tarot","ritual","numerology","photo"].includes(source.kind) ? "aura" : source.kind) as CrossProductContext;
  const [settings,natal,hd,aura,palm] = await Promise.all([getRuneSettings(),isNatalChartEnabled(),isHumanDesignEnabled(),isAuraReadingEnabled(),isPalmReadingEnabled()]);
  const allowed:Record<string,boolean> = {natal,human_design:hd,aura,palm,matrix:true,matrix_compatibility:true};
  const topic=/отношен|любов|партн[её]р|совместим|пар[аеыу]/i.test(doc.question??"")?"relationships":"self";
  const candidates=[...resolveCrossProductRecommendations(context,{topic}),...(["matrix","natal","human_design","matrix_compatibility","aura","palm"] as CrossProductContext[]).flatMap(candidate=>resolveCrossProductRecommendations(candidate,{topic}))];
  const rec = candidates.find(r=>allowed[r.product] && !owned.has(r.product));
  const continuation = source.kind === "photo"
    ? {id:"photo_again",product:"tarot" as const,title:"Новый ФотоТаро",href:"/?photo=1",benefit:BENEFITS.photo,cost:settings.costs.VISION_ANALYSIS,rubPerRune:settings.rubPerRune}
    : rec ? {...rec,benefit:BENEFITS[rec.product],cost:settings.costs[ACTIONS[rec.product]],rubPerRune:settings.rubPerRune} : null;
  return {reading:{id:source.id,title:doc.title,kind:source.kind,date:source.created_at.toISOString(),href:doc.printPath??`/cabinet/readings/${source.id}/print`},note:note.rows[0]??null,continuation};
}

export function validJourneyTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length>80 || (value!=="UTC" && !/^(?:[A-Za-z_]+\/)+[A-Za-z0-9_+-]+$/.test(value))) return false;
  try {new Intl.DateTimeFormat("en",{timeZone:value}).format(); return true;} catch {return false;}
}

export async function saveJourneyNote(userId: string, readingId: string, input: {insight:string;step:string;reflection:string;reminder:boolean;timezone?:string;channel?:"email"|"telegram"}) {
  const journey = await getReadingJourney(userId,readingId);
  if (!journey) throw new Error("reading_not_found");
  if ((input.timezone !== undefined && !validJourneyTimezone(input.timezone)) || (input.reminder && (!input.timezone || !input.channel))) throw new Error("invalid_reminder");
  return withTransaction(async client=>{
    await queryClient(client,`INSERT INTO diary_entries(user_id,character_key,entry_text,reading_id,reading_kind,weekly_step,reflection,reminder_consent_at,reminder_timezone,reminder_channel,reading_completed_at)
      VALUES($1,'personal',$2,$3,$4,$5,$6,CASE WHEN $7 THEN NOW() END,$8,$9,$10)
      ON CONFLICT(user_id,reading_id) WHERE reading_id IS NOT NULL DO UPDATE SET entry_text=EXCLUDED.entry_text,weekly_step=EXCLUDED.weekly_step,reflection=EXCLUDED.reflection,
        reminder_consent_at=CASE WHEN $7 THEN COALESCE(diary_entries.reminder_consent_at,NOW()) END,reminder_timezone=EXCLUDED.reminder_timezone,reminder_channel=EXCLUDED.reminder_channel`,
      [userId,input.insight,readingId,journey.reading.kind,input.step,input.reflection,input.reminder,input.timezone??null,input.channel??null,journey.reading.date]);
    for (const [event,value] of [["insight_saved",input.insight],["step_saved",input.step],["changes_saved",input.reflection]] as const) {
      if(value.trim()) await recordJourneyEvent(userId,event,readingId,{product:journey.reading.kind},client);
    }
    await recordProductActivity(userId,"diary_saved",readingId,{product:journey.reading.kind},client);
  });
}
