"use client";
import { useEffect, useState } from "react";
import { readPendingReading, clearPendingReading } from "@/lib/chat-reading-helpers";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";
import { useRuneConfig } from "@/lib/useRuneConfig";
import RuneOrderPreview from "@/components/RuneOrderPreview";
export default function PendingReadingResume() {
  const {config,fromServer}=useRuneConfig();
  const {firstExperienceEnabled}=usePlatformFeatures();
  const [pending,setPending]=useState<ReturnType<typeof readPendingReading>>(null);
  useEffect(()=>{if(firstExperienceEnabled)setPending(readPendingReading());},[firstExperienceEnabled]);
  if(!pending || !firstExperienceEnabled)return null;
  return <section className="my-5 rounded-2xl border border-aura-gold/25 p-4"><h2 className="font-display text-xl text-white">Выбранный разбор сохранён</h2><p className="mt-2 text-sm text-white/65">Можно продолжить сейчас или оставить на потом.</p><RuneOrderPreview cost={config.costs.READING}/><button type="button" disabled={!fromServer} className="btn-luxe btn-luxe--gold min-h-11 w-full sm:w-auto" onClick={()=>{const master=pending.masterId;clearPendingReading();setPending(null);window.location.href=`/?master=${encodeURIComponent(master)}`;}}>Подтвердить разбор · {config.costs.READING} ᚢ</button></section>;
}
