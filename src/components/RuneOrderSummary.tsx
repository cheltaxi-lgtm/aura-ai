"use client";
import { runeOrderQuote, type QuotePackage } from "@/lib/rune-order-quote";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";
export default function RuneOrderSummary({cost,balance,rubPerRune,packages}:{cost:number;balance:number;rubPerRune:number;packages:QuotePackage[]}) {
  const {firstExperienceEnabled}=usePlatformFeatures();
  if(!firstExperienceEnabled || cost<=0)return null;
  const quote=runeOrderQuote(cost,balance,rubPerRune,packages);if(!quote)return null;
  return <div className="my-4 rounded-xl border border-aura-gold/25 bg-aura-gold/5 p-4 text-sm leading-relaxed text-white/75"><p>Выбранный разбор: <strong className="text-white">{quote.cost} ᚢ</strong> · эквивалент {quote.rubEquivalent} ₽ по базовому тарифу.</p><p className="mt-1">Баланс: {balance} ᚢ. {quote.shortage>0?`Не хватает ${quote.shortage} ᚢ (эквивалент ${quote.shortageRubEquivalent} ₽).`:`После разбора останется ${balance-cost} ᚢ.`}</p>{quote.package && <p className="mt-2">Подойдёт «{quote.package.name}»: {quote.package.runes+quote.package.bonus_runes} ᚢ за {Number(quote.package.price_rub)} ₽. После пополнения — {quote.package.afterTopup} ᚢ, после выбранного разбора — {quote.package.afterOrder} ᚢ.</p>}<p className="mt-2 text-xs text-white/50">Пополнение не запускает заказ. Разбор нужно подтвердить отдельно.</p></div>;
}
