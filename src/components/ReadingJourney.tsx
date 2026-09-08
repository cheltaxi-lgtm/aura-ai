"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";
import type { getReadingJourney } from "@/lib/reading-journey";

type Journey = NonNullable<Awaited<ReturnType<typeof getReadingJourney>>>;
export default function ReadingJourney({readingId,context}:{readingId?:string;context?:string}) {
  const {firstExperienceEnabled}=usePlatformFeatures();
  const [loadError,setLoadError]=useState(false); const [retry,setRetry]=useState(0);
  const [journey,setJourney]=useState<Journey|null>(null);
  const [insight,setInsight]=useState(""); const [step,setStep]=useState(""); const [reflection,setReflection]=useState("");
  const [reminder,setReminder]=useState(false); const [channels,setChannels]=useState<string[]>([]); const [channel,setChannel]=useState("email");
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState(""); const inFlight=useRef(false); const id=useId();
  useEffect(()=>{
    if(!firstExperienceEnabled) return;
    const controller=new AbortController();setLoadError(false);setJourney(null);
    const selectedId=readingId ?? new URLSearchParams(window.location.search).get("readingId") ?? undefined;
    void fetch(`/api/diary/journey${selectedId?`?readingId=${encodeURIComponent(selectedId)}`:""}`,{signal:controller.signal}).then(async response=>{
      if(!response.ok){if(response.status!==401 && response.status!==404)throw new Error();return;}
      const data=await response.json(); const next=data.journey as Journey|null;
      if(controller.signal.aborted || !next || (context && next.reading.kind!==context)) return;
      setJourney(next);setInsight(next.note?.entry_text??"");setStep(next.note?.weekly_step??"");setReflection(next.note?.reflection??"");setReminder(Boolean(next.note?.reminder_consent_at));setChannels(data.channels??[]);setChannel(next.note?.reminder_channel??data.channels?.[0]??"email");
      if(next.continuation) void fetch("/api/diary/journey",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:"continuation_shown",readingId:next.reading.id,continuationId:next.continuation.id})}).catch(()=>undefined);
    }).catch(()=>{if(!controller.signal.aborted)setLoadError(true);});
    return ()=>controller.abort();
  },[firstExperienceEnabled,readingId,context,retry]);
  if(!firstExperienceEnabled)return null;
  if(loadError)return <div className="my-4 rounded-xl border border-white/15 p-4 text-sm text-white/65" role="status">Дневник временно не загрузился. <button className="min-h-11 text-aura-gold underline" onClick={()=>setRetry(n=>n+1)}>Попробовать снова</button></div>;
  if(!journey)return null;
  const save=async()=>{
    if(inFlight.current) return; inFlight.current=true;setBusy(true);setMessage("");
    try {
      const response=await fetch("/api/diary/journey",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({readingId:journey.reading.id,insight,step,reflection,reminder,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,channel})});
      if(!response.ok) throw new Error();setJourney(current=>current?{...current,note:{...current.note,entry_text:insight,weekly_step:step,reflection,reminder_consent_at:reminder?new Date().toISOString():null,reminder_channel:reminder?channel:null} as Journey["note"]}:current);setMessage("Сохранено в вашем дневнике.");
    }catch{setMessage("Не удалось сохранить. Ваш текст остался здесь — попробуйте ещё раз.");}
    finally{inFlight.current=false;setBusy(false);}
  };
  const field="ym-disable-keys mt-2 block min-h-24 w-full resize-y rounded-xl border border-white/15 bg-black/20 p-3 text-base text-white placeholder:text-white/40 focus:border-aura-gold focus:outline-none";
  return <section className="ym-hide-content my-6 min-w-0 rounded-2xl border border-aura-gold/25 bg-gradient-to-br from-aura-gold/10 to-transparent p-4 sm:p-6" aria-labelledby={`${id}-title`}>
    <p className="text-xs uppercase tracking-widest text-aura-gold">Ваш личный опыт</p>
    <h2 id={`${id}-title`} className="mt-2 font-display text-2xl text-white">Что хочется взять с собой?</h2>
    <Link className="mt-2 inline-block py-2 text-sm text-aura-gold underline underline-offset-4" href={journey.reading.href}>Разбор: {journey.reading.title}</Link>
    <p className="mt-1 text-sm leading-relaxed text-white/65">Сохраните важное и вернитесь к своим наблюдениям. Дневник и история бесплатны.</p>
    {journey.note?.entry_text && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-white/75">{journey.note.entry_text}</p>}
    {journey.note?.weekly_step && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-white/65">Шаг на неделю: {journey.note.weekly_step}</p>}
    <details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 text-sm text-aura-gold">Сохранить вывод, выбрать шаг или отметить изменения</summary><div className="mt-4 space-y-4">
      <label className="block text-sm text-white/85" htmlFor={`${id}-insight`}>Мой главный вывод<textarea id={`${id}-insight`} className={field} value={insight} onChange={e=>setInsight(e.target.value)} maxLength={2000} placeholder="Что оказалось полезным для меня?" /></label>
      <label className="block text-sm text-white/85" htmlFor={`${id}-step`}>Небольшой шаг на неделю<textarea id={`${id}-step`} className={field} value={step} onChange={e=>setStep(e.target.value)} maxLength={2000} placeholder="Одно посильное действие, которое я выбираю сам" /></label>
      <label className="block text-sm text-white/85" htmlFor={`${id}-changes`}>Что изменилось?<textarea id={`${id}-changes`} className={field} value={reflection} onChange={e=>setReflection(e.target.value)} maxLength={2000} placeholder="Можно заполнить позже — здесь нет правильного ответа" /></label>
      {channels.length>1 && <label className="block text-sm text-white/70">Канал напоминания<select className="ml-2 min-h-11 rounded border border-white/20 bg-neutral-900 p-2" value={channel} onChange={e=>setChannel(e.target.value)}><option value="email">Email</option><option value="telegram">Telegram</option></select></label>}
      {channels.length>0 && <label className="flex min-h-11 items-start gap-3 text-sm leading-relaxed text-white/70"><input className="mt-1 size-5 shrink-0 accent-amber-400" type="checkbox" checked={reminder} onChange={e=>setReminder(e.target.checked)} /><span>Напомнить {channel==="telegram"?"в Telegram":"по email"} через 2 дня после разбора о выводе и через 7 дней об изменениях. Только если я ещё их не записал. Можно отключить здесь или в письме.</span></label>}
      <button type="button" className="btn-luxe btn-luxe--gold min-h-11 w-full sm:w-auto" onClick={()=>void save()} disabled={busy}>{busy?"Сохраняем…":"Сохранить бесплатно"}</button>
      <p role="status" className="text-sm text-white/75">{message}</p>
    </div></details>
    {journey.continuation && <div className="mt-5 border-t border-aura-gold/20 pt-5"><p className="text-sm text-aura-gold">Если захотите продолжить</p><h3 className="mt-2 text-lg text-white">{journey.continuation.title}</h3><p className="mt-2 text-sm leading-relaxed text-white/65">{journey.continuation.benefit}</p><p className="my-3 text-sm text-white">{journey.continuation.cost} ᚢ · эквивалент {Math.round(journey.continuation.cost*journey.continuation.rubPerRune)} ₽ по базовому тарифу</p><Link className="btn-luxe btn-luxe--outline min-h-11 w-full sm:w-auto" href={journey.continuation.href} onClick={()=>{void fetch("/api/diary/journey",{method:"POST",headers:{"Content-Type":"application/json"},keepalive:true,body:JSON.stringify({event:"continuation_selected",readingId:journey.reading.id,continuationId:journey.continuation?.id})}).catch(()=>undefined);}}>Посмотреть, что входит</Link><p className="mt-2 text-xs text-white/50">Новый разбор начнётся только после вашего подтверждения.</p></div>}
  </section>;
}
