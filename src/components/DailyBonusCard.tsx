"use client";
import { useCallback, useEffect, useState } from "react";
import { useDailyBonus } from "@/hooks/useDailyBonus";
import { emitRuneBalanceUpdate } from "@/components/RuneBalance";

type BonusStatus = { available:boolean;amount:number;nextEligibleAt:string;enabled:boolean };
export default function DailyBonusCard({enabled,onBalance}:{enabled:boolean;onBalance?:(balance:number)=>void}) {
  const [status,setStatus]=useState<BonusStatus|null>(null);
  const [message,setMessage]=useState("");
  const {bonusResult,loading,error,claimManually}=useDailyBonus(enabled);
  const refresh=useCallback(async()=>{
    try {
      const response=await fetch("/api/runes/daily/status",{cache:"no-store"});
      if(response.ok)setStatus(await response.json());
    } catch { /* The explicit button can retry status loading. */ }
  },[]);
  useEffect(()=>{
    if(!enabled)return;
    void refresh();
    const visible=()=>{if(document.visibilityState==="visible")void refresh();};
    document.addEventListener("visibilitychange",visible);
    const timer=window.setInterval(visible,60_000); // Read-only; never claims a bonus.
    return()=>{document.removeEventListener("visibilitychange",visible);window.clearInterval(timer);};
  },[enabled,refresh]);
  useEffect(()=>{
    if(!bonusResult)return;
    const balance=bonusResult.newBalance??bonusResult.currentBalance;
    if(typeof balance==="number"){emitRuneBalanceUpdate(balance);onBalance?.(balance);}
    if(bonusResult.claimed)setMessage(`За посещение начислено ${bonusResult.bonusAmount} рун.`);
    void refresh();
  },[bonusResult,refresh,onBalance]);
  if(!enabled)return null;
  return <section id="daily-bonus" className="mb-6 space-y-3 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4">
    <h2 className="text-lg font-semibold text-white">Бонус за посещение</h2>
      <p className="text-sm text-white/75">{status?.amount??5} рун за ваше действие на открытой странице. Следующий бонус — через 24 часа после получения. За дни без посещений руны не начисляются.</p>
      {status?.available?<button className="cabinet-btn cabinet-btn--primary" disabled={loading} onClick={(event)=>void claimManually(event.nativeEvent)}>{loading?"Получаем…":"Получить бонус"}</button>:
        status?<p className="text-sm text-white/65">{status.enabled?`Следующий бонус: ${new Date(status.nextEligibleAt).toLocaleString("ru-RU")}`:"Бонусы временно недоступны."}</p>:
        <button className="cabinet-btn" onClick={()=>void refresh()}>Проверить доступность</button>}
    {(error||message)&&<p role="status" className="text-sm text-amber-200">{error||message}</p>}
  </section>;
}
