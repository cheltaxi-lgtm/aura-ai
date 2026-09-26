import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const m=vi.hoisted(()=>({auth:vi.fn(),rate:vi.fn(),db:vi.fn(),query:vi.fn(),configured:vi.fn(),create:vi.fn(),captcha:vi.fn(),record:vi.fn()}));
vi.mock("@/lib/require-auth",()=>({requireProfileUserId:m.auth}));
vi.mock("@/lib/api-guards",()=>({enforcePaidRouteRateLimit:m.rate}));
vi.mock("@/lib/db",()=>({ensureDb:m.db,query:m.query}));
vi.mock("@/lib/yukassa",()=>({isYukassaConfigured:m.configured,createYukassaRunePayment:m.create}));
vi.mock("@/lib/recaptcha-guard",()=>({enforceRecaptchaScope:m.captcha}));
vi.mock("@/lib/rune-settings",()=>({getRuneSettings:async()=>({rubPerRune:5})}));
vi.mock("@/lib/spread-metrics-store",()=>({recordJourneyEvent:m.record}));
import { POST } from "@/app/api/runes/purchase/route";
const request=(body:unknown)=>new NextRequest("https://zovus.ru/api/runes/purchase",{method:"POST",body:JSON.stringify(body)});
beforeEach(()=>{
  vi.clearAllMocks();
  m.auth.mockResolvedValue({auth:{sub:"account"},profileUserId:"profile"});
  m.rate.mockResolvedValue(null);m.db.mockResolvedValue(true);m.configured.mockReturnValue(true);m.captcha.mockResolvedValue(null);
  m.record.mockResolvedValue(undefined);m.create.mockResolvedValue({id:"provider-id",confirmation:{confirmation_url:"https://payment.example/checkout"}});
});
describe("checkout diagnostics cannot alter payment authority",()=>{
  it("records the attempt and a fixed rejection code before reaching the provider",async()=>{
    expect((await POST(request({customAmount:50}))).status).toBe(400);
    expect(m.record).toHaveBeenCalledWith("profile","payment_attempted",expect.any(String),{});
    expect(m.record).toHaveBeenCalledWith("profile","payment_failed",expect.any(String),{errorCode:"amount_below_minimum"});
    expect(m.create).not.toHaveBeenCalled();
  });
  it("rejects null JSON without crashing and records CAPTCHA failures",async()=>{
    expect((await POST(request(null))).status).toBe(400);
    m.captcha.mockResolvedValue(NextResponse.json({error:"captcha"},{status:403}));
    expect((await POST(request({customAmount:100}))).status).toBe(403);
    expect(m.record).toHaveBeenCalledWith("profile","payment_failed",expect.any(String),{errorCode:"captcha_rejected"});
  });
  it("creates a server-priced minimum top-up even when optional analytics storage fails",async()=>{
    m.record.mockRejectedValue(new Error("telemetry offline"));
    const quiet=vi.spyOn(console,"error").mockImplementation(()=>undefined);
    try {
      const result=await POST(request({customAmount:100,runes:10000}));
      expect(result.status).toBe(200);
      expect((await result.json()).paymentUrl).toBe("https://payment.example/checkout");
      expect(m.create).toHaveBeenCalledWith(expect.objectContaining({priceRub:100,totalRunes:20,userId:"profile"}));
    } finally { quiet.mockRestore(); }
  });
  it("keeps authentication and rate limits ahead of telemetry database writes",async()=>{
    m.auth.mockResolvedValueOnce(null);
    expect((await POST(request({customAmount:100}))).status).toBe(401);
    m.rate.mockResolvedValue(NextResponse.json({error:"rate_limit"},{status:429}));
    expect((await POST(request({customAmount:100}))).status).toBe(429);
    expect(m.record).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
  });
});
