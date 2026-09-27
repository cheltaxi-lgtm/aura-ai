import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks=vi.hoisted(()=>({query:vi.fn(),auth:vi.fn(),profile:vi.fn(),worker:vi.fn(),limit:vi.fn(),context:vi.fn()}));
vi.mock("@/lib/db",()=>({query:mocks.query}));
vi.mock("@/lib/require-auth",()=>({requireUserAuth:mocks.auth,requireProfileUserId:vi.fn(async()=>({auth:{sub:"account"},profileUserId:"owner-profile"}))}));
vi.mock("@/lib/accounts",()=>({getProfileUserIdForAccount:mocks.profile}));
vi.mock("@/lib/async-job-worker-auth",()=>({getAsyncJobWorkerUserId:mocks.worker}));
vi.mock("@/lib/api-guards",()=>({enforcePaidRouteRateLimit:mocks.limit}));
vi.mock("@/lib/activation-store",()=>({getUserActivationContext:mocks.context}));
import { observeProductRequest, activationRejectionCode } from "@/lib/activation-telemetry";
import { POST, GET } from "@/app/api/auth/activation/route";
import { dailyReminderEmailHtml } from "@/lib/email/templates";

beforeEach(()=>{vi.clearAllMocks();mocks.query.mockResolvedValue({rows:[]});mocks.auth.mockResolvedValue({sub:"account",role:"user"});mocks.profile.mockResolvedValue("owner-profile");mocks.worker.mockReturnValue(null);mocks.limit.mockResolvedValue(null);});
afterEach(()=>vi.restoreAllMocks());

describe("activation observations preserve product authority",()=>{
  it("keeps the exact error response and records only a fixed rejection code, never provider messages",async()=>{
    const reply=NextResponse.json({code:"insufficient_runes",message:"private question and email",required:30,balance:10},{status:402});
    const handler=vi.fn(async()=>reply);
    expect(await observeProductRequest(new NextRequest("https://zovus.ru/api/aura/report"),"aura",handler)).toBe(reply);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledTimes(2);
    const params=mocks.query.mock.calls[1][1];
    expect(params.slice(0,3)).toEqual(["owner-profile","request_rejected","aura"]);
    expect(params[4]).toBe('{"code":"insufficient_runes"}');
    expect(JSON.stringify(mocks.query.mock.calls)).not.toContain("private question");
    expect(activationRejectionCode(500,{error:"person@mail.ru"})).toBe("server_error");
  });
  it("does not count worker execution as a second client attempt",async()=>{
    mocks.worker.mockReturnValue("worker-profile");
    const response=NextResponse.json({ok:true});
    expect(await observeProductRequest(new NextRequest("https://zovus.ru/api/reading"),"tarot",async()=>response)).toBe(response);
    expect(mocks.auth).not.toHaveBeenCalled();expect(mocks.query).not.toHaveBeenCalled();
  });
  it("does not block an accepted product request when telemetry storage is unavailable",async()=>{
    mocks.query.mockRejectedValue(new Error("offline"));vi.spyOn(console,"warn").mockImplementation(()=>undefined);
    const response=NextResponse.json({jobId:"job"},{status:202});
    expect(await observeProductRequest(new NextRequest("https://zovus.ru/api/reading"),"tarot",async()=>response)).toBe(response);
  });
  it("binds client observations to authenticated owner and refuses invented server results and foreign origins",async()=>{
    const body={product:"aura",event:"offer_clicked",key:crypto.randomUUID(),userId:"foreign",email:"private@mail.ru",question:"private"};
    const request=(origin:string,data:unknown)=>new NextRequest("https://zovus.ru/api/auth/activation",{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(data)});
    expect((await POST(request("https://foreign.test",body))).status).toBe(403);
    expect((await POST(request("https://zovus.ru",{...body,event:"request_accepted"}))).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
    expect((await POST(request("https://zovus.ru",body))).status).toBe(200);
    expect(mocks.query.mock.calls[0][1][0]).toBe("owner-profile");
    expect(JSON.stringify(mocks.query.mock.calls)).not.toContain("private");
    expect(JSON.stringify(mocks.query.mock.calls)).not.toContain("foreign");
  });
  it("serves only the authenticated activation context without caching it",async()=>{
    mocks.context.mockResolvedValue({stage:"preview_only",continuation:{href:"/aura?reading=owned"}});
    const response=await GET();
    expect(mocks.context).toHaveBeenCalledWith("owner-profile");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    mocks.context.mockResolvedValue(null);expect((await GET()).status).toBe(403);
  });
  it("uses the trusted public origin behind a proxy rather than the internal Next hostname",async()=>{
    vi.stubEnv("NODE_ENV","production");
    try {
      const body=JSON.stringify({product:"daily",event:"offer_shown",key:crypto.randomUUID()});
      const request=(origin:string)=>new NextRequest("http://localhost:3000/api/auth/activation",{method:"POST",headers:{origin,"x-forwarded-host":"zovus.ru","x-forwarded-proto":"https","Content-Type":"application/json"},body});
      expect((await POST(request("https://zovus.ru"))).status).toBe(200);
      expect((await POST(request("https://foreign.test"))).status).toBe(403);
    } finally {vi.unstubAllEnvs();}
  });
  it("keeps daily reminders free for a first use and describes preview continuation as a separate quoted purchase",()=>{
    const daily=dailyReminderEmailHtml("Test","https://zovus.ru","/unsubscribe",undefined,{firstUse:true,preview:false,path:"/?daily=1",label:"Открыть расклад на сутки"});
    expect(daily).toContain("Стартовые руны останутся");expect(daily).toContain('href="https://zovus.ru/?daily=1"');
    const preview=dailyReminderEmailHtml("Test","https://zovus.ru","/unsubscribe",undefined,{firstUse:false,preview:true,path:"/aura?reading=owned",label:"Продолжить разбор ауры"});
    expect(preview).toContain("перед запуском вы увидите стоимость");expect(preview).toContain('href="https://zovus.ru/aura?reading=owned"');
    expect(preview).not.toContain("расклад на сутки ждёт");
  });
});
