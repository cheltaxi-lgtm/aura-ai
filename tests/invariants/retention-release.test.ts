import { describe, expect, it } from "vitest";
import { analyticsPageUrl } from "@/lib/utm/marketing-url";
import { dailyAuthReturn } from "@/lib/daily-auth-return";
import { buildLoginHref, buildRegisterHref } from "@/lib/post-auth-return";
import { runeShopDestination } from "@/lib/rune-purchase-client";
import { runeOrderQuote } from "@/lib/rune-order-quote";
import { runePackageValue } from "@/lib/tariff-pricing";

const packages=[{id:"starter",name:"Начало",runes:50,bonus_runes:0,price_rub:250}];
describe("return from reminders and affordable checkout",()=>{
  it("attributes email visits while dropping questions, identity, authorization and unsafe labels",()=>{
    expect(analyticsPageUrl("https://zovus.ru/?daily=1&utm_source=zovus&utm_medium=email&utm_campaign=daily_reading&utm_content=button&utm_term=personal&email=person%40mail.ru&ask=secret&code=oauth&token=private#secret"))
      .toBe("https://zovus.ru/?utm_source=zovus&utm_medium=email&utm_campaign=daily_reading&utm_content=button");
    expect(analyticsPageUrl("https://zovus.ru/auth?utm_content=person%40mail.ru&utm_campaign=private%20question"))
      .toBe("https://zovus.ru/auth");
  });
  it("returns existing email readers to login with campaign intact, including old links",()=>{
    const next=dailyAuthReturn("?daily=1&utm_source=zovus&utm_medium=email&utm_campaign=daily_reading&token=secret");
    expect(next.returning).toBe(true);
    const login=new URL(buildLoginHref(next.returnTo),"https://zovus.ru");
    expect(login.pathname).toBe("/auth/user/login");
    expect(login.searchParams.get("utm_campaign")).toBe("daily_reading");
    expect(login.searchParams.get("returnTo")).toBe("/?daily=1&utm_source=zovus&utm_medium=email&utm_campaign=daily_reading");
    expect(dailyAuthReturn("?dailyCards=true")).toEqual({returnTo:"/?daily=1",returning:true});
    const fresh=dailyAuthReturn("?daily=extended");
    expect(fresh.returning).toBe(false);
    expect(new URL(buildRegisterHref(fresh.returnTo),"https://zovus.ru").searchParams.get("returnTo")).toBe("/?daily=extended");
  });
  it("preserves a guest's selected package through authentication without accepting URL injection",()=>{
    const destination=runeShopDestination("adept");
    expect(destination).toBe("/cabinet?shop=1&package=adept");
    expect(new URL(buildRegisterHref(destination),"https://zovus.ru").searchParams.get("returnTo")).toBe(destination);
    expect(runeShopDestination("adept&paymentUrl=https://evil.example")).toBe("/cabinet?shop=1");
  });
  it("offers the minimum 100-ruble top-up for 20 missing runes, without launching an order",()=>{
    expect(runeOrderQuote(30,10,5,packages)?.customTopup).toEqual({amountRub:100,runes:20,afterTopup:30,afterOrder:0});
    expect(runeOrderQuote(30,20,5,packages)?.customTopup).toMatchObject({amountRub:100,runes:20,afterOrder:10});
    expect(runeOrderQuote(30,30,5,packages)?.customTopup).toBeNull();
  });
  it("covers fractional rates, respects the purchase limit and prefers a genuinely cheaper package",()=>{
    expect(runeOrderQuote(31,0,3.7,packages)?.customTopup).toMatchObject({amountRub:115,runes:31,afterOrder:0});
    expect(runeOrderQuote(51,0,5,[{...packages[0],runes:55,price_rub:200}])?.customTopup).toBeNull();
    expect(runeOrderQuote(10001,0,5,[])?.customTopup).toBeNull();
    expect(runeOrderQuote(30,0,NaN,packages)).toBeNull();
  });
  it("calculates value from actual bonus-inclusive prices instead of claiming a nonexistent discount",()=>{
    expect(runePackageValue({runes:150,bonus_runes:15,price_rub:825},5)).toEqual({perRune:5,savingPercent:0});
    expect(runePackageValue({runes:150,bonus_runes:15,price_rub:750},5)?.savingPercent).toBe(9);
    expect(runePackageValue({runes:500,bonus_runes:75,price_rub:2500},5)?.savingPercent).toBe(13);
  });
});
