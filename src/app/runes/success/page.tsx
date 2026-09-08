"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { emitRuneBalanceUpdate } from "@/components/RuneBalance";
import { clearPendingRunePurchase, hasFiredRunePurchaseGoal, markRunePurchaseGoalFired, readPendingRuneOrderId, readPendingRunePaymentId, readRunePurchaseDestination } from "@/lib/rune-purchase-client";
import { trackPaymentCancelled, trackRunePurchase } from "@/lib/seo/metrika";
import { pushEcommercePurchase } from "@/lib/seo/ecommerce";

export default function RunePurchaseSuccessPage() {
  const [destination,setDestination]=useState("/cabinet");
  const [status,setStatus]=useState<"polling"|"ready"|"timeout"|"cancelled"|"rejected">("polling");
  useEffect(()=>{
    const controller=new AbortController(); let timer:ReturnType<typeof setTimeout>|undefined; let attempts=0;
    setDestination(readRunePurchaseDestination());
    const search=new URLSearchParams(window.location.search);
    const orderId=readPendingRuneOrderId(search);
    const paymentId=orderId && !search.get("paymentId")?null:readPendingRunePaymentId(search);
    if(!paymentId && !orderId){setStatus("timeout");return ()=>controller.abort();}
    const poll=async()=>{
      try {
        const response=await fetch("/api/runes/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(paymentId?{paymentId}:{orderId}),signal:controller.signal});
        const data=await response.json(); if(controller.signal.aborted) return;
        if(response.ok && ["credited","already_credited"].includes(data.status) && typeof data.balance==="number"){
          const confirmedId=typeof data.paymentId==="string"?data.paymentId:paymentId;
          if(confirmedId)setDestination(readRunePurchaseDestination(confirmedId));
          if(confirmedId && typeof data.amountRub==="number" && !hasFiredRunePurchaseGoal(confirmedId)){
            trackRunePurchase(data.amountRub,data.packageId);
            pushEcommercePurchase({paymentId:confirmedId,amountRub:data.amountRub,product:{id:data.packageId??"custom",name:data.packageName??"Пакет рун",price:data.amountRub,category:"runes"}});
            markRunePurchaseGoalFired(confirmedId);
          }
          emitRuneBalanceUpdate(data.balance);clearPendingRunePurchase(confirmedId,orderId);setStatus("ready");return;
        }
        if(response.ok && data.status==="cancelled"){trackPaymentCancelled("runes_success_return");clearPendingRunePurchase(typeof data.paymentId==="string"?data.paymentId:paymentId,orderId);setStatus("cancelled");return;}
        if([401,403,422].includes(response.status) || data.status==="rejected"){setStatus("rejected");return;}
      }catch{if(controller.signal.aborted)return;}
      attempts++;if(attempts>=20){setStatus("timeout");return;}
      timer=setTimeout(()=>void poll(),2000);
    };
    void poll();return ()=>{controller.abort();if(timer)clearTimeout(timer);};
  },[]);
  const title={polling:"Подтверждаем оплату",ready:"Руны на вашем балансе",timeout:"Ожидаем подтверждение",cancelled:"Оплата не завершена",rejected:"Нужна проверка платежа"}[status];
  const message={polling:"Проверяем статус платежа. Это может занять немного времени.",ready:"Выберите, когда продолжить. Пополнение не запускает разбор и не списывает руны за него.",timeout:"Подтверждение пока не получено. Можно проверить позже — повторно оплачивать не нужно.",cancelled:"Платёж отменён. Вы можете вернуться к выбранной услуге.",rejected:"Начисление пока не подтверждено. Проверьте вход в свой аккаунт или обратитесь в поддержку."}[status];
  return <main className="flex min-h-screen items-center justify-center p-4"><section className="w-full max-w-md rounded-2xl border border-aura-gold/25 bg-aura-gold/5 p-6 text-center sm:p-8"><div className="mb-5 text-5xl text-aura-gold" aria-hidden>ᚢ</div><h1 className="font-display text-2xl text-white">{title}</h1><p role="status" className="my-5 text-sm leading-relaxed text-white/65">{message}</p>{status==="timeout" && <button className="btn-luxe btn-luxe--gold mb-3 min-h-11 w-full" onClick={()=>window.location.reload()}>Проверить статус</button>}<Link href={destination} className="btn-luxe btn-luxe--outline min-h-11 w-full">Вернуться к выбору разбора</Link></section></main>;
}
