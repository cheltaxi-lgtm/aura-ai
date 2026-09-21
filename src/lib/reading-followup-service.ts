import { query } from "@/lib/db";
import { isReadingFollowupDeliveryEnabled } from "@/lib/first-experience-policy";
import { validJourneyTimezone } from "@/lib/reading-journey";
import { ACCOUNT_DELIVERABLE_EMAIL_SQL } from "@/lib/reminder-contacts";
import { reminderUnsubscribeUrl } from "@/lib/reminder-unsubscribe";
import { sendEmail } from "@/lib/email/send";
import { getSiteUrl } from "@/lib/email/mail-config";
import { notifyBotReminder } from "@/lib/telegram/notify-bot-reminder";
import { testAccountEmailSql, testProfileNameSql } from "@/lib/test-accounts";
import { finishProactiveContact, reserveProactiveContact } from "@/lib/proactive-contact-policy";

/** Personal local time; quiet hours 20:00–09:00. DST handled by Intl/IANA. */
export function readingFollowupStage(input:{completedAt:Date;now:Date;timezone:string;insight:string;reflection:string}):2|7|null {
  if(!validJourneyTimezone(input.timezone))return null;
  const age=(input.now.getTime()-input.completedAt.getTime())/86_400_000;
  const hour=Number(new Intl.DateTimeFormat("en",{timeZone:input.timezone,hour:"numeric",hourCycle:"h23"}).format(input.now));
  if(hour<9 || hour>=20)return null;
  // A stale result never starts a catch-up campaign. At most one stage per run.
  if(age>=7 && age<10 && !input.reflection.trim())return 7;
  if(age>=2 && age<5 && !input.insight.trim())return 2;
  return null;
}

export async function runReadingFollowups(now=new Date(), clock:()=>Date=()=>new Date()) {
  const startedAt=clock().getTime();
  if(!isReadingFollowupDeliveryEnabled())return {enabled:false,claimed:0,delivered:0,failed:0};
  const rows=await query<{id:string;reading_id:string;user_id:string;account_id:string;entry_text:string;reflection:string;reminder_timezone:string;reminder_channel:"email"|"telegram";reading_completed_at:Date;email:string|null;telegram_user_id:string|null;consent_version:string}>(`SELECT d.id,d.reading_id,d.user_id,ua.id AS account_id,d.entry_text,d.reflection,d.reminder_timezone,d.reminder_channel,d.reading_completed_at,(${ACCOUNT_DELIVERABLE_EMAIL_SQL}) AS email,ti.telegram_user_id::text,d.reminder_consent_at::text AS consent_version
    FROM diary_entries d JOIN users u ON u.id=d.user_id JOIN user_accounts ua ON ua.profile_user_id=u.id
    LEFT JOIN user_telegram_identities ti ON ti.user_account_id=ua.id
    WHERE d.reminder_consent_at IS NOT NULL AND d.reading_completed_at BETWEEN $1::timestamptz-INTERVAL '10 days' AND $1::timestamptz-INTERVAL '2 days'
    AND ((d.followup_2_claimed_at IS NULL AND length(trim(d.entry_text))=0 AND d.reading_completed_at>$1::timestamptz-INTERVAL '5 days') OR (d.followup_7_claimed_at IS NULL AND length(trim(d.reflection))=0 AND d.reading_completed_at<=$1::timestamptz-INTERVAL '7 days'))
    AND u.erasure_requested_at IS NULL AND ua.erasure_requested_at IS NULL
    AND CASE WHEN d.reminder_timezone IN (SELECT name FROM pg_timezone_names) THEN EXTRACT(HOUR FROM $1::timestamptz AT TIME ZONE d.reminder_timezone) BETWEEN 9 AND 19 ELSE false END
    AND ((d.reminder_channel='email' AND (${ACCOUNT_DELIVERABLE_EMAIL_SQL}) IS NOT NULL) OR (d.reminder_channel='telegram' AND ti.telegram_user_id IS NOT NULL))
    AND NOT COALESCE(${testAccountEmailSql("ua.email")},false) AND NOT COALESCE(${testProfileNameSql("u.name")},false)
    AND NOT EXISTS(SELECT 1 FROM reengagement_email_log cap WHERE cap.user_id=d.user_id AND cap.template='reading_followup' AND cap.sent_date=($1::timestamptz AT TIME ZONE 'UTC')::date)
    ORDER BY d.reading_completed_at,d.id LIMIT 100`,[now]);
  let claimed=0,delivered=0,failed=0;
  for(const row of rows.rows) {
    const deliveryNow=new Date(now.getTime()+Math.max(0,clock().getTime()-startedAt));
    const stage=readingFollowupStage({completedAt:row.reading_completed_at,now:deliveryNow,timezone:row.reminder_timezone,insight:row.entry_text,reflection:row.reflection});
    if(!stage || (row.reminder_channel==="email"?!row.email:!row.telegram_user_id))continue;
    const column=stage===2?"followup_2_claimed_at":"followup_7_claimed_at";
    const content=stage===2?"entry_text":"reflection";
    const reservation=await reserveProactiveContact(row.user_id,"reading_followup",`reading_followup:${row.reading_id}:${stage}`);
    if(!reservation)continue;
    let contactDelivered=false;
    try {
      // Durable at-most-once claim. Never retry an ambiguous provider outcome or switch channels.
      // Recheck consent and completed action atomically immediately before delivery.
      const claim=await query(`WITH eligible AS (SELECT d.id,d.user_id FROM diary_entries d WHERE d.id=$1 AND d.reminder_consent_at=$3::timestamptz AND d.reminder_channel=$4 AND d.reminder_timezone=$5 AND d.${column} IS NULL AND length(trim(d.${content}))=0 AND EXTRACT(HOUR FROM $2::timestamptz AT TIME ZONE d.reminder_timezone) BETWEEN 9 AND 19
        AND EXISTS(SELECT 1 FROM user_accounts ua JOIN users u ON u.id=ua.profile_user_id LEFT JOIN user_telegram_identities ti ON ti.user_account_id=ua.id WHERE ua.id=$6 AND u.id=d.user_id AND ua.erasure_requested_at IS NULL AND u.erasure_requested_at IS NULL
        AND (($4='email' AND (${ACCOUNT_DELIVERABLE_EMAIL_SQL})=$7) OR ($4='telegram' AND ti.telegram_user_id::text=$8))) FOR UPDATE OF d), delivery AS (INSERT INTO reengagement_email_log(user_id,template,sent_date,created_at) SELECT user_id,'reading_followup',($2::timestamptz AT TIME ZONE 'UTC')::date,$2 FROM eligible ON CONFLICT(user_id,template,sent_date) DO NOTHING RETURNING user_id) UPDATE diary_entries d SET ${column}=$2 WHERE d.id IN (SELECT id FROM eligible) AND d.user_id IN (SELECT user_id FROM delivery) RETURNING d.id`,[row.id,deliveryNow,row.consent_version,row.reminder_channel,row.reminder_timezone,row.account_id,row.email,row.telegram_user_id]);
      if(!claim.rowCount)continue;claimed++;
      const unsub=await reminderUnsubscribeUrl(row.account_id,"reading_followup");
      const url=`${getSiteUrl()}/cabinet?readingId=${encodeURIComponent(row.reading_id)}`;
      const title=stage===2?"Что было полезно в разборе?":"Что изменилось за неделю?";
      const body=stage===2?"Если хочется, сохраните свой главный вывод в бесплатном дневнике.":"Можно вернуться к выбранному шагу и записать свои наблюдения. Новый разбор для этого не нужен.";
      const ok=row.reminder_channel==="telegram"?(await notifyBotReminder({telegramUserId:Number(row.telegram_user_id),sourceProfileUserId:row.user_id,kind:"reading_followup",title,body,ctaUrl:url,ctaLabel:"Открыть дневник",unsubscribeUrl:unsub})).delivered:
        await sendEmail({to:row.email!,subject:`Zovus — ${title}`,text:`${body}\n${url}\nОтключить: ${unsub}`,html:`<div style="max-width:520px;margin:auto;padding:32px;font-family:Georgia,serif;line-height:1.7"><p>ZOVUS</p><h1 style="font-size:24px">${title}</h1><p>${body}</p><p><a href="${url}">Открыть дневник</a></p><p><a href="${unsub}">Отключить эти напоминания</a></p></div>`,template:`reading_followup_${stage}`,listUnsubscribeUrl:unsub});
      contactDelivered=ok;
      if(ok)delivered++;else failed++;
      await query("INSERT INTO reengagement_email_log(user_id,template) VALUES($1,$2) ON CONFLICT(user_id,template,sent_date) DO NOTHING",[row.user_id,`reading_${stage}_${ok?"delivered":"unconfirmed"}`]);
    }catch{failed++;}
    finally{await finishProactiveContact(reservation.id,contactDelivered);}
  }
  return {enabled:true,claimed,delivered,failed};
}
