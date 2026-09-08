export type QuotePackage = {id:string;name:string;runes:number;bonus_runes:number;price_rub:number};
/** Existing packages only; lowest actual ruble price that covers the shortfall. */
export function runeOrderQuote(cost:number,balance:number,rubPerRune:number,packages:QuotePackage[]) {
  if(![cost,balance,rubPerRune].every(Number.isFinite) || cost<0 || balance<0 || rubPerRune<=0)return null;
  const shortage=Math.max(0,cost-balance);
  const pkg=shortage>0?[...packages].filter(p=>Number.isFinite(Number(p.price_rub)) && Number(p.price_rub)>0 && p.runes+p.bonus_runes>=shortage).sort((a,b)=>Number(a.price_rub)-Number(b.price_rub) || a.runes+a.bonus_runes-b.runes-b.bonus_runes)[0]:undefined;
  return {cost,balance,shortage,rubEquivalent:Math.round(cost*rubPerRune*100)/100,shortageRubEquivalent:Math.round(shortage*rubPerRune*100)/100,package:pkg?{...pkg,afterTopup:balance+pkg.runes+pkg.bonus_runes,afterOrder:balance+pkg.runes+pkg.bonus_runes-cost}:null};
}
