import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  other: false, sectional: false,
  lens: vi.fn(async () => "PRIVATE_SELF_MEMORY_CONTEXT"),
  full: vi.fn(async () => "Complete fixture report"),
  sections: vi.fn(async () => ({ text:"Complete fixture report",needsRegeneration:false,quality:{findings:[]},modelId:"fixture",costRub:0,usage:{},llmCalls:1 })),
}));
vi.mock("@/lib/require-auth", () => ({resolveProfileUserContext:async()=>({ok:true,profileUserId:"fixture-user"}),profileAuthFailureResponse:vi.fn()}));
vi.mock("@/lib/settings", () => ({isHumanDesignEnabled:async()=>true}));
vi.mock("@/lib/api-guards", () => ({enforcePaidRouteRateLimit:async()=>null}));
vi.mock("@/lib/llm", () => ({isOpenRouterConfigured:()=>true,isHardRejectedLlmOutput:()=>false}));
vi.mock("@/lib/accounts", () => ({resolveUnlimitedAccess:async()=>false}));
vi.mock("@/lib/rune-settings", () => ({getRuneSettings:async()=>({})}));
vi.mock("@/lib/rune-service", () => ({isRuneBillingActive:()=>true}));
vi.mock("@/lib/services/billing-service", () => ({ensureSufficientRunes:vi.fn(),InsufficientFundsError:class extends Error{}}));
vi.mock("@/lib/async-job-worker-auth", () => ({getAsyncJobWorkerUserId:()=>null,getReportWorkerJobFromRequest:()=>null,isAsyncJobWorkerConfigured:()=>false}));
vi.mock("@/lib/async-job-enqueue", () => ({enqueuePaidAsyncJob:vi.fn()}));
vi.mock("@/lib/async-job-lifecycle", () => ({makeWorkerProgressReporter:()=>vi.fn(),shouldRefundBeforeWorkerFail:async()=>true,trackWorkerJobCompleted:vi.fn(),trackWorkerJobFailed:vi.fn()}));
vi.mock("@/lib/db", () => ({query:async()=>({rows:[{id:"fixture-user"}]})}));
vi.mock("@/lib/users", () => ({getUserById:async()=>({name:"Владелец"})}));
vi.mock("@/lib/age-gate", () => ({AGE_REQUIRED_ERROR:{},isUserAgeEligible:()=>true}));
vi.mock("@/lib/services/human-design-service", () => ({
  HD_UUID_RE:/^[a-f0-9-]{36}$/i, mapHdRelationToSelf:()=>null,
  getHdChartById:async(id:string)=>({id,userId:"fixture-user",engineVersion:"fixture",subjectKind:fixture.other?"other":"self",subjectName:"Другой человек",chart:{},placeName:"Москва"}),
  getHdReportForChart:async()=>null,getHdCompositeReport:async()=>null,hasRuneRefundForTransaction:async()=>false,
  toPublicHdReport:vi.fn(),toPublicHdCompositeReport:vi.fn(),
}));
vi.mock("@/lib/services/hd-generation-service", () => ({
  acquireHdGeneration:async(input:{charts:unknown[];context:unknown})=>({guard:{kind:"personal"},charts:input.charts,context:input.context,charge:{newBalance:100}}),
  assertHdGenerationCurrent:async()=>{},failHdGeneration:vi.fn(),saveHdGeneration:async()=>({id:"saved",status:"done"}),
  hdPurchaseIdentity:()=>"fixture",HdGenerationConflict:class extends Error{},
}));
vi.mock("@/lib/human-design", () => ({HD_ENGINE_VERSION:"fixture",HD_CONNECTION_RELATIONS:[],connectionRelationPromptHint:vi.fn(),formatHdConnectionEvidence:vi.fn(),buildHdCompositeReportSystemPrompt:vi.fn(),sanitizeHdCompositeReportText:(text:string)=>text}));
vi.mock("@/lib/human-design/prompt", () => ({buildHdReportSystemPrompt:()=>"HD grounded prompt",formatHdEvidence:()=>"HD evidence",sanitizeHdReportText:(text:string)=>text}));
vi.mock("@/lib/hd-report-pipeline/generate", () => ({generateHdReportSectional:fixture.sections}));
vi.mock("@/lib/hd-report-pipeline/flags", () => ({isHdSectionalReportEnabled:()=>fixture.sectional}));
vi.mock("@/lib/human-design/report-generate", () => ({completeHdFullReport:fixture.full,completeHdCompositeReport:vi.fn()}));
vi.mock("@/lib/prompt-policy", () => ({wrapSystemPrompt:async(text:string)=>text}));
vi.mock("@/lib/human-design/personalization-lens", () => ({appendHdPersonalizationLens:fixture.lens}));
vi.mock("@/lib/memory/request-capture", () => ({captureMemoryGenerationForRequest:async()=>({})}));
vi.mock("@/lib/human-design/memory", () => ({rememberHdChartFact:async()=>{}}));

import { handleHdPurchase } from "@/lib/services/hd-purchase-route";

describe("paid HD personalization boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); fixture.other=false; fixture.sectional=false; });
  it.each([false,true])("uses personal memory only for self, sectional=%s", async sectional => {
    fixture.sectional=sectional;
    for (const other of [false,true]) {
      vi.clearAllMocks(); fixture.other=other;
      const request=new NextRequest("http://localhost/api/human-design/report",{method:"POST",body:JSON.stringify({chartId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",aiDataUseAcknowledged:true})});
      expect((await handleHdPurchase(request,"personal")).status).toBe(200);
      const generator=sectional?fixture.sections:fixture.full;
      expect(generator).toHaveBeenCalledOnce();
      const options=generator.mock.calls[0] as unknown as [Record<string,unknown>];
      const prompt=String(options[0][sectional?"extraSystem":"systemPrompt"] ?? "");
      expect(prompt.includes("PRIVATE_SELF_MEMORY_CONTEXT")).toBe(!other);
      expect(fixture.lens).toHaveBeenCalledTimes(other?0:1);
    }
  });
});
