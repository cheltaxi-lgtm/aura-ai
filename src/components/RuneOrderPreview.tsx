"use client";
import { useEffect, useState } from "react";
import RuneOrderSummary from "@/components/RuneOrderSummary";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";
import { useRuneConfig } from "@/lib/useRuneConfig";
import type { RuneActionType } from "@/lib/rune-costs";
import type { QuotePackage } from "@/lib/rune-order-quote";

/** Display only. The existing purchase endpoint still validates and charges the real price. */
export default function RuneOrderPreview({cost:providedCost,action}:{cost?:number;action?:RuneActionType}) {
  const {config,fromServer}=useRuneConfig();
  const cost=providedCost ?? (action && fromServer ? config.costs[action] : 0);
  const {firstExperienceEnabled}=usePlatformFeatures();
  const [quote,setQuote]=useState<{balance:number;rubPerRune:number;packages:QuotePackage[]}|null>(null);
  useEffect(()=>{
    if(!firstExperienceEnabled)return;
    const controller=new AbortController();
    const load=async()=>{try{
      const [balance,config]=await Promise.all([fetch("/api/runes/balance",{signal:controller.signal}),fetch("/api/runes/config",{signal:controller.signal})]);
      if(!balance.ok || !config.ok)return;
      const [b,c]=await Promise.all([balance.json(),config.json()]);
      if(!controller.signal.aborted && typeof b.balance==="number" && Number(c.rubPerRune)>0)setQuote({balance:b.balance,rubPerRune:Number(c.rubPerRune),packages:c.packages??[]});
    }catch{/* A missing quote is never a zero balance. */}};
    void load();window.addEventListener("focus",load);return ()=>{controller.abort();window.removeEventListener("focus",load);};
  },[firstExperienceEnabled,cost]);
  if(!firstExperienceEnabled)return null;
  return quote?<RuneOrderSummary cost={cost} {...quote}/>:<p className="my-3 text-xs text-white/50">Баланс и тариф уточняются перед заказом. Если данные не загрузились, обновите страницу.</p>;
}
