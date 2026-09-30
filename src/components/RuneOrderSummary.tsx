"use client";
import { runeOrderQuote, type QuotePackage } from "@/lib/rune-order-quote";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";
export default function RuneOrderSummary({cost,balance,rubPerRune,packages,onCustomPurchase,purchasing=false}:{cost:number;balance:number;rubPerRune:number;packages:QuotePackage[];onCustomPurchase?:(amountRub:number)=>void;purchasing?:boolean}) {
  const {firstExperienceEnabled}=usePlatformFeatures();
  if(!firstExperienceEnabled || cost<=0)return null;
  const quote=runeOrderQuote(cost,balance,rubPerRune,packages);if(!quote)return null;
  const custom=quote.customTopup;
  return <div className="my-4 rounded-xl border border-aura-gold/25 bg-aura-gold/5 p-4 text-sm leading-relaxed text-white/75">
    <p>Выбранный разбор: <strong className="text-white">{quote.cost} ᚢ</strong> · эквивалент {quote.rubEquivalent} ₽ по базовому тарифу.</p>
    <p className="mt-1">Баланс: {balance} ᚢ. {quote.shortage>0?`Не хватает ${quote.shortage} ᚢ.`:`После разбора останется ${balance-cost} ᚢ.`}</p>
    {custom ? <>
      <p className="mt-2">Достаточно пополнить на {custom.amountRub} ₽: получите {custom.runes} ᚢ. После разбора останется {custom.afterOrder} ᚢ.</p>
      {onCustomPurchase ? <button type="button" className="btn-luxe btn-luxe--gold mt-3 min-h-11 w-full disabled:opacity-60" style={{transitionProperty:"transform, opacity"}} disabled={purchasing} onClick={()=>onCustomPurchase(custom.amountRub)}>{purchasing?"Оформление…":`Пополнить на ${custom.amountRub} ₽ · ${custom.runes} ᚢ`}</button> : null}
    </> : quote.package ? <p className="mt-2">Подойдёт «{quote.package.name}»: {quote.package.runes+quote.package.bonus_runes} ᚢ за {Number(quote.package.price_rub)} ₽. После выбранного разбора — {quote.package.afterOrder} ᚢ.</p> : null}
    <p className="mt-2 text-xs text-white/50">Пополнение не запускает заказ. Разбор нужно подтвердить отдельно.</p>
  </div>;
}
