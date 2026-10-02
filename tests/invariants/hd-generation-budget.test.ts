import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateHdChart } from "@/lib/human-design/calculate";
import { buildHdLockedContract } from "@/lib/hd-report-pipeline/contract";
import { validateHdReportText } from "@/lib/hd-report-quality/validator";
import { HD_PIPELINE_BATCHES } from "@/lib/hd-report-pipeline/sections";

const mocked=vi.hoisted(()=>({complete:vi.fn(),mutate:(title:string,body:string)=>body,finish:"stop" as string|null}));
vi.mock("@/lib/llm",()=>({completeChatDetailed:mocked.complete,isHardRejectedLlmOutput:()=>false}));
vi.mock("@/lib/ai-model",()=>({getHdModel:async()=>"fixture/hd",getNatalModel:async()=>"fixture/natal"}));
vi.mock("@/lib/hd-report-pipeline/cost",()=>({resolveCostRubFromUsage:async()=>({rub:null,source:"unavailable"})}));
import { generateHdReportSectional } from "@/lib/hd-report-pipeline/generate";
import { refineProHdReport } from "@/modules/pro/ai/hd-refine";
import { generateProPremiumReport } from "@/modules/pro/ai/generate-premium";

const birth={birthDate:"1987-04-03",birthTime:"14:00",timezone:"Asia/Yekaterinburg"};
const chart=calculateHdChart(birth);
const good=readFileSync("scripts/fixtures/hd-live-svetlana-sectional.md","utf8").replace(/\r\n/g,"\n");
const chunks=good.split(/^## /m);
const bodies=new Map(chunks.map((chunk,i)=>i===0?["Вступление",chunk.trim()]:[chunk.slice(0,chunk.indexOf("\n")).trim(),chunk.slice(chunk.indexOf("\n")+1).trim()]));
beforeEach(()=>{
  vi.stubEnv("HD_PIPELINE_LLM_EDITOR","1");
  vi.clearAllMocks(); mocked.finish="stop"; mocked.mutate=(_title,body)=>body;
  mocked.complete.mockImplementation(async(opts:{messages:{role:string;content:string}[];beforeRequest?:()=>Promise<void>})=>{
    await opts.beforeRequest?.();
    const user=opts.messages.at(-1)!.content;
    if(opts.messages[0]!.content.includes("Ты редактор"))return {text:user.slice(user.indexOf("\n\n")+2),finishReason:"stop",usage:{promptTokens:10,completionTokens:20}};
    const headings=user.split("Напиши ТОЛЬКО эти разделы с точными заголовками:\n")[1]!.split("\nКаждый раздел")[0]!;
    const titles=headings.split("\n").map(x=>x.startsWith("## ")?x.slice(3):"Вступление");
    const text=titles.map(t=>(t==="Вступление"?"":`## ${t}\n`)+mocked.mutate(t,bodies.get(t)!)).join("\n\n");
    return {text,finishReason:mocked.finish,usage:{promptTokens:10,completionTokens:20}};
  });
});

describe("HD bounded provider generation",()=>{
  it("passes substantive text in 12 batches + editor, with one shared deadline and lease guard",async()=>{
    const before=vi.fn(async()=>{}),deadlineAt=Date.now()+120_000;
    const r=await generateHdReportSectional({chart,clientName:"Светлана",deadlineAt,beforeRequest:before});
    expect(r.needsRegeneration).toBe(false);expect(r.quality.findings).toEqual([]);
    expect(r.llmCalls).toBe(HD_PIPELINE_BATCHES.length+1);expect(before).toHaveBeenCalledTimes(r.llmCalls);
    for(const [opts] of mocked.complete.mock.calls)expect(opts).toMatchObject({deadlineAt,beforeRequest:before,maxAttempts:1,skipTemperatureRetry:true});
    expect(r.costRub).toBeNull(); expect(r.modelId).toBe("fixture/hd");
  });
  it.each(["length",null,"content_filter","error"])("rejects unsuccessful provider ending %s even when headings and volume look complete",async(finish)=>{
    mocked.finish=finish;
    const r=await generateHdReportSectional({chart,clientName:"Светлана",maxSectionRetries:0});
    expect(r.needsRegeneration).toBe(true);
    expect(r.quality.findings.some(f=>f.detail.startsWith("provider_truncated:"))).toBe(true);
  });
  it("marks total usage incomplete if even one real call omits token counts",async()=>{
    const normal=mocked.complete.getMockImplementation()!;let first=true;
    mocked.complete.mockImplementation(async opts=>{const result=await normal(opts);if(first){first=false;return{...result,usage:undefined}}return result;});
    const r=await generateHdReportSectional({chart,clientName:"Светлана"});
    expect(r.needsRegeneration).toBe(false);expect(r.llmCalls).toBe(13);expect(r.usage.complete).toBe(false);expect(r.costRub).toBeNull();
  });
  it("repairs only the section with a wrong fact",async()=>{
    let injected=false;
    mocked.mutate=(title,body)=>{if(title==="Бизнес и работа"&&!injected){injected=true;return body+"\nВаш профиль — 1/3.";}return body;};
    const r=await generateHdReportSectional({chart,clientName:"Светлана",maxSectionRetries:1});
    expect(r.needsRegeneration).toBe(false);
    const repair=mocked.complete.mock.calls.filter(([o])=>o.messages.at(-1).content.includes("Напиши ТОЛЬКО"));
    expect(repair).toHaveLength(HD_PIPELINE_BATCHES.length+1);
    expect(repair.at(-1)![0].messages.at(-1).content).toContain("## Бизнес и работа\nКаждый раздел");
  });
  it("does not call a provider after an expired deadline",async()=>{
    const r=await generateHdReportSectional({chart,clientName:"Светлана",deadlineAt:Date.now()-1});
    expect(mocked.complete).not.toHaveBeenCalled(); expect(r.needsRegeneration).toBe(true);
  });
  it("does not send more sections after an erasure/cancellation guard rejects",async()=>{
    const guard=vi.fn(async()=>{throw Error("account_inactive");});
    await expect(generateHdReportSectional({chart,clientName:"Светлана",beforeRequest:guard})).rejects.toThrow("account_inactive");
    expect(mocked.complete.mock.calls.length).toBeLessThanOrEqual(6);
  });
  it("Pro formatting preserves final quality and actual HD telemetry",async()=>{
    mocked.mutate=(title,body)=>title==="Вступление"?body+"\nРазбор не является медицинским диагнозом.":body;
    const r=await generateProPremiumReport({type:"hd",payload:{...birth,timeKnown:true},clientAlias:"Светлана"});
    const text=r.blocks.map(b=>b.title==="Вступление"?b.body:`## ${b.title}\n${b.body}${b.practice?`\n\nПрактика: ${b.practice}`:""}`).join("\n\n");
    expect(text).not.toContain("[редакция:");
    expect(validateHdReportText(text,{contract:buildHdLockedContract(chart)}).findings).toEqual([]);
    expect(r.aiTelemetry).toMatchObject({modelId:"fixture/hd",costRub:null,llmCalls:13,usage:{promptTokens:130,completionTokens:260}});
  });
  it('Pro refinement uses the saved chart, real model telemetry, deadline and final factual gate',async()=>{
    const draft=await generateProPremiumReport({type:'hd',payload:{...birth,timeKnown:true},clientAlias:'Светлана'});
    const blockIndex=draft.blocks.findIndex(b=>b.title==='Бизнес и работа'),original=draft.blocks[blockIndex]!;
    const text=original.body+(original.practice?`\n\nПрактика: ${original.practice}`:'');
    mocked.complete.mockImplementation(async(opts)=>{await opts.beforeRequest?.();return{text,finishReason:'stop',usage:{promptTokens:11,completionTokens:22}}});
    const before=vi.fn(async()=>{}),deadlineAt=Date.now()+95_000;
    const result=await refineProHdReport({blocks:draft.blocks,snapshot:draft.snapshot,blockIndex,instruction:'Уточни практику',clientAlias:'Светлана',question:null,deadlineAt,beforeRequest:before});
    expect(result.aiTelemetry).toMatchObject({modelId:'fixture/hd',costRub:null,llmCalls:1,usage:{promptTokens:11,completionTokens:22}});
    expect(mocked.complete.mock.calls.at(-1)![0]).toMatchObject({modelOverride:'fixture/hd',maxAttempts:1,deadlineAt,beforeRequest:before});expect(before).toHaveBeenCalledOnce();
    for(const finishReason of ['length',null,'content_filter','error']){
      mocked.complete.mockResolvedValue({text,finishReason,usage:{promptTokens:1,completionTokens:2}});
      await expect(refineProHdReport({blocks:draft.blocks,snapshot:draft.snapshot,blockIndex,instruction:'Уточни',clientAlias:'Светлана',question:null,deadlineAt,beforeRequest:before})).rejects.toThrow('hd_refine_incomplete');
    }
    mocked.complete.mockResolvedValue({text:text+'\nВаш профиль составляет 1/3.',finishReason:'stop',usage:{promptTokens:1,completionTokens:2}});
    await expect(refineProHdReport({blocks:draft.blocks,snapshot:draft.snapshot,blockIndex,instruction:'Уточни',clientAlias:'Светлана',question:null,deadlineAt,beforeRequest:before})).rejects.toThrow('hd_quality_needs_regeneration');
  });

});
