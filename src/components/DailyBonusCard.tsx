"use client";
import { useCallback, useEffect, useState } from "react";
import { useDailyBonus } from "@/hooks/useDailyBonus";
import { emitRuneBalanceUpdate } from "@/components/RuneBalance";

type BonusStatus = { available:boolean;amount:number;nextEligibleAt:string;verificationRequired:boolean;enabled:boolean };
export default function DailyBonusCard({enabled,onBalance}:{enabled:boolean;onBalance?:(balance:number)=>void}) {
  const [status,setStatus]=useState<BonusStatus|null>(null);
  const [message,setMessage]=useState("");
  const [sending,setSending]=useState(false);
  const {bonusResult,loading,error,claimManually}=useDailyBonus(enabled && status?.verificationRequired===false);
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
  async function resend() {
    setSending(true);setMessage("");
    try {
      const response=await fetch("/api/auth/user/verify-email",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
      const data=await response.json();setMessage(response.ok?"Письмо отправлено. Проверьте почту, включая папку «Спам».":data.error);
    } catch {setMessage("Не удалось отправить письмо. Попробуйте снова.");}
    finally{setSending(false);}
  }
  if(!enabled)return null;
  return <section id="daily-bonus" className="mb-6 space-y-3 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4">
    <h2 className="text-lg font-semibold text-white">Бонус за посещение</h2>
    {status?.verificationRequired?<>
      <p className="text-sm text-white/75">Подтвердите почту, чтобы получить стартовые руны и бонусы за посещение.</p>
      <button disabled={sending} className="cabinet-btn cabinet-btn--primary" onClick={()=>void resend()}>{sending?"Отправляем…":"Отправить письмо подтверждения"}</button>
    </>:<>
      <p className="text-sm text-white/75">{status?.amount??5} рун за ваше действие на открытой странице. Следующий бонус — через 24 часа после получения. За дни без посещений руны не начисляются.</p>
      {status?.available?<button className="cabinet-btn cabinet-btn--primary" disabled={loading} onClick={(event)=>void claimManually(event.nativeEvent)}>{loading?"Получаем…":"Получить бонус"}</button>:
        status?<p className="text-sm text-white/65">{status.enabled?`Следующий бонус: ${new Date(status.nextEligibleAt).toLocaleString("ru-RU")}`:"Бонусы временно недоступны."}</p>:
        <button className="cabinet-btn" onClick={()=>void refresh()}>Проверить доступность</button>}
    </>}
    {(error||message)&&<p role="status" className="text-sm text-amber-200">{error||message}</p>}
  </section>;
}
