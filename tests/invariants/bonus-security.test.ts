import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks=vi.hoisted(()=>({query:vi.fn(),queryClient:vi.fn(),grant:vi.fn(),send:vi.fn(),captcha:vi.fn()}));
vi.mock("@/lib/db",()=>({query:mocks.query,queryClient:mocks.queryClient,withTransaction:async(fn:(client:object)=>unknown)=>fn({})}));
vi.mock("@/lib/rune-service",()=>({grantStarterRunesIfNeeded:mocks.grant}));
vi.mock("@/lib/email/send",()=>({sendEmail:mocks.send}));
vi.mock("@/lib/api-guards",()=>({clientIp:()=>"127.0.0.1"}));
vi.mock("@/lib/recaptcha",()=>({verifyRecaptchaForScope:mocks.captcha}));
import { sendBonusEmailVerification, verifyBonusEmail } from "@/lib/bonus-email-verification";
import { verifyToken, signToken } from "@/lib/auth";
import { enforceRecaptchaScope } from "@/lib/recaptcha-guard";
const account={id:"owner",email:"owner@example.com",profile_user_id:"profile",token_version:4,bonus_email_verification_required:true};
beforeEach(()=>{
  vi.clearAllMocks();vi.stubEnv("AUTH_SECRET","isolated-bonus-test-signing-secret");
  mocks.query.mockResolvedValue({rows:[account]});mocks.queryClient.mockResolvedValue({rows:[account]});
  mocks.send.mockResolvedValue(true);mocks.grant.mockResolvedValue({granted:100,balance:100});
});
afterEach(()=>vi.unstubAllEnvs());
async function emailedToken(){await sendBonusEmailVerification("owner");return decodeURIComponent(mocks.send.mock.calls[0][0].text.match(/#token=([^\s]+)/)[1]);}
describe("bonus email token and native registration boundaries",()=>{
  it("cannot use a verification token as an authenticated session",async()=>{
    const token=await emailedToken();expect(await verifyToken(token)).toBeNull();
    await expect(verifyBonusEmail("owner",token)).resolves.toEqual({granted:100,balance:100});
    expect(mocks.grant).toHaveBeenCalledWith("profile",expect.any(Object));
  });
  it("cannot use a session JWT as email proof",async()=>{
    const token=await signToken({sub:"owner",email:account.email,name:"Owner",role:"user",tv:4});
    await expect(verifyBonusEmail("owner",token)).rejects.toThrow();expect(mocks.grant).not.toHaveBeenCalled();
  });
  it("rejects another logged-in account and stale token version",async()=>{
    const token=await emailedToken();await expect(verifyBonusEmail("other",token)).rejects.toThrow("invalid_verification");
    mocks.queryClient.mockResolvedValue({rows:[{...account,token_version:5}]});
    await expect(verifyBonusEmail("owner",token)).rejects.toThrow("invalid_verification");expect(mocks.grant).not.toHaveBeenCalled();
  });
  it("does not bypass registration captcha for a caller-controlled app header",async()=>{
    mocks.captcha.mockResolvedValue({ok:false,error:"denied"});
    const request=new NextRequest("http://localhost/api/auth/user/register",{method:"POST",headers:{"x-zovus-app":"1","user-agent":"Capacitor"}});
    const result=await enforceRecaptchaScope("register",undefined,request);
    expect(result?.status).toBe(400);expect(mocks.captcha).toHaveBeenCalled();
  });
});
