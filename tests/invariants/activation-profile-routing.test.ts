import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
vi.mock("@/lib/maintenance-mode",()=>({fetchMaintenanceModeActive:vi.fn(async()=>false),isMaintenanceBypassPath:()=>false,isSearchEngineBot:()=>false,MAINTENANCE_BOT_RETRY_AFTER_SEC:60,MAINTENANCE_PAGE_PATH:"/maintenance"}));
vi.mock("@/lib/token-version-gate",()=>({fetchUserTokenVersionStatus:vi.fn(async()=>"ok")}));
import { middleware } from "@/middleware";
const secret="activation-route-test-only";
beforeEach(()=>{vi.stubEnv("AUTH_SECRET",secret);vi.stubEnv("PRO_MODULE_ENABLED","false");});
afterEach(()=>vi.unstubAllEnvs());
describe("consumer profile is independent of the Pro kill switch",()=>{
  it("allows authenticated GET and PATCH profile with Pro disabled, keeping anonymous access denied",async()=>{
    const token=await new SignJWT({sub:"fixture-account",role:"user",tv:0}).setProtectedHeader({alg:"HS256"}).setExpirationTime("1h").sign(new TextEncoder().encode(secret));
    for(const method of ["GET","PATCH"]){
      const response=await middleware(new NextRequest("https://zovus.ru/api/profile",{method,headers:{cookie:`aura_auth=${token}`}}));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
    expect((await middleware(new NextRequest("https://zovus.ru/api/profile"))).status).toBe(401);
  });
  it("keeps actual Pro API and pages disabled",async()=>{
    for(const path of ["/api/pro","/api/pro/profile","/pro","/pro/settings","/admin/pro"]){
      expect((await middleware(new NextRequest(`https://zovus.ru${path}`))).status).toBe(404);
    }
  });
});
