import { recordJourneyEvent } from "@/lib/spread-metrics-store";
import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { isFirstExperienceEnabled } from "@/lib/first-experience-policy";
import { getReadingJourney, saveJourneyNote } from "@/lib/reading-journey";
import { getAccountDeliverableEmail } from "@/lib/reminder-contacts";
import { query } from "@/lib/db";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function access() {
  if(!isFirstExperienceEnabled()) return NextResponse.json({error:"disabled"},{status:404});
  const auth=await requireProfileUserId();
  if(!auth) return NextResponse.json({error:"auth_required"},{status:401});
  const limited=await enforcePaidRouteRateLimit(auth.profileUserId,"reading_journey");if(limited)return limited;
  if(!await ensureDb()) return NextResponse.json({error:"temporarily_unavailable"},{status:503});
  return auth;
}
export async function GET(request:NextRequest) {
  const auth=await access(); if(auth instanceof NextResponse) return auth;
  const id=request.nextUrl.searchParams.get("readingId")??undefined;
  if(id && !uuid.test(id)) return NextResponse.json({error:"invalid_reading"},{status:400});
  try {
    const journey=await getReadingJourney(auth.profileUserId,id);
    const email=await getAccountDeliverableEmail(auth.auth.sub);
    const tg=await query("SELECT 1 FROM user_telegram_identities WHERE user_account_id=$1 LIMIT 1",[auth.auth.sub]);
    return NextResponse.json({journey,channels:[...(email?["email"]:[]),...(tg.rowCount?["telegram"]:[])]},{headers:{"Cache-Control":"private, no-store"}});
  } catch { return NextResponse.json({error:"temporarily_unavailable"},{status:503}); }
}
export async function POST(request:NextRequest) {
  const auth=await access(); if(auth instanceof NextResponse) return auth;
  let body:Record<string,unknown>;
  try {body=await request.json();}catch{return NextResponse.json({error:"invalid_json"},{status:400});}
  if(typeof body.readingId!=="string" || !uuid.test(body.readingId)) return NextResponse.json({error:"invalid_reading"},{status:400});
  if(body.event==="continuation_shown" || body.event==="continuation_selected") {
    const journey=await getReadingJourney(auth.profileUserId,body.readingId);
    if(!journey?.continuation || journey.continuation.id!==body.continuationId) return NextResponse.json({error:"invalid_continuation"},{status:400});
    await recordJourneyEvent(auth.profileUserId,body.event,`${body.readingId}:${journey.continuation.id}`,{product:journey.continuation.product});
    return NextResponse.json({ok:true});
  }
  if(![body.insight,body.step,body.reflection].every(s=>typeof s==="string" && s.length<=2000) || typeof body.reminder!=="boolean") return NextResponse.json({error:"invalid_note"},{status:400});
  // Explicit email consent applies to these two requested reminders only, not marketing.
  if(body.reminder) {
    const allowed=body.channel==="email"?Boolean(await getAccountDeliverableEmail(auth.auth.sub)):body.channel==="telegram"?Boolean((await query("SELECT 1 FROM user_telegram_identities WHERE user_account_id=$1 LIMIT 1",[auth.auth.sub])).rowCount):false;
    if(!allowed)return NextResponse.json({error:"channel_unavailable"},{status:400});
  }
  try {
    await saveJourneyNote(auth.profileUserId,body.readingId,{insight:(body.insight as string).trim(),step:(body.step as string).trim(),reflection:(body.reflection as string).trim(),reminder:body.reminder,timezone:typeof body.timezone==="string"?body.timezone:undefined,channel:body.channel==="email"?"email":body.channel==="telegram"?"telegram":undefined});
    return NextResponse.json({ok:true});
  }catch(error){return NextResponse.json({error:error instanceof Error && ["reading_not_found","invalid_reminder"].includes(error.message)?error.message:"temporarily_unavailable"},{status:error instanceof Error && ["reading_not_found","invalid_reminder"].includes(error.message)?400:503});}
}
export async function DELETE() {
  const auth=await access(); if(auth instanceof NextResponse) return auth;
  await query("UPDATE diary_entries SET reminder_consent_at=NULL WHERE user_id=$1 AND reading_id IS NOT NULL",[auth.profileUserId]);
  return NextResponse.json({ok:true});
}
