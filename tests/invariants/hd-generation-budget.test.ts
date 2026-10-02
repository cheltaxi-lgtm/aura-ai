import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateHdChart } from "@/lib/human-design/calculate";
import { buildHdLockedContract } from "@/lib/hd-report-pipeline/contract";
import { validateHdReportText } from "@/lib/hd-report-quality/validator";
import { HD_PIPELINE_BATCHES } from "@/lib/hd-report-pipeline/sections";
import { HD_COMPOSITE_REQUIRED_SECTIONS } from "@/lib/human-design/packages";
import { completeHdCompositeReport, completeHdFullReport } from "@/lib/human-design/report-generate";

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
  it("replaces a longer factually wrong composite section with a shorter correct rewrite",async()=>{
    const partner=calculateHdChart({birthDate:"1990-05-15",birthTime:"14:30",timezone:"Asia/Yekaterinburg"});
    const fill=(index:number)=>Array.from({length:90},(_,word)=>`ситуация${index}пример${word}`).join(" ");
    const title="Доминантность и компромисс",index=HD_COMPOSITE_REQUIRED_SECTIONS.indexOf(title);
    const correct=fill(index)+"\nДоминантные каналы: Алексей — 3; Анна — 4. Всего семь доминантных каналов. Компромиссных каналов — 0.";
    const bad=fill(index)+"\nАлексей — 4; Анна — 3.\n"+Array.from({length:30},(_,word)=>`длиннаяошибка${word}`).join(" ");
    const initial=fill(99)+"\n\n"+HD_COMPOSITE_REQUIRED_SECTIONS.map((t,i)=>`## ${t}\n${t===title?bad:fill(i)}`).join("\n\n");
    mocked.complete.mockReset().mockResolvedValueOnce({text:initial,finishReason:"stop"}).mockResolvedValueOnce({text:`## ${title}\n${correct}`,finishReason:"stop"});
    const guard=vi.fn(async()=>{}),deadlineAt=Date.now()+90_000;
    const result=await completeHdCompositeReport({systemPrompt:"Полный разбор пары",evidence:"Расчётные данные",nameA:"Алексей",nameB:"Анна",charts:{a:chart,b:partner},deadlineAt,beforeRequest:guard});
    expect(result).not.toBeNull();expect(result).toContain(correct);expect(result).not.toContain("Алексей — 4; Анна — 3");
    expect(result!.match(/## Доминантность и компромисс/gu)).toHaveLength(1);
    expect(result!.indexOf(`## ${title}`)).toBeLessThan(result!.indexOf(`## ${HD_COMPOSITE_REQUIRED_SECTIONS[index+1]}`));
    expect(mocked.complete).toHaveBeenCalledTimes(2);
    expect(mocked.complete.mock.calls[1]![0].messages.at(-1).content).toContain(`## ${title}`);
    expect(mocked.complete.mock.calls[1]![0]).toMatchObject({deadlineAt,maxAttempts:1,beforeRequest:guard});
  });
  it("repairs the unheaded introduction without retaining the wrong longer preamble",async()=>{
    const intro=good.split(/^## /m)[0]!;
    const initial="Одна группа включает Эго и Сакральный центры. "+Array.from({length:25},(_,i)=>`ошибочнаяфраза${i}`).join(" ")+"\n"+good;
    mocked.complete.mockReset().mockResolvedValueOnce({text:initial,finishReason:"stop"}).mockResolvedValueOnce({text:`## Вступление\n${intro}`,finishReason:"stop"});
    const result=await completeHdFullReport({systemPrompt:"Полный разбор",evidence:"Расчётные данные",clientName:"Светлана",chart});
    expect(result).not.toBeNull();expect(result).toMatch(/^Светлана/u);expect(result).not.toContain("Одна группа включает Эго и Сакральный");
    expect(result).not.toContain("## Вступление");expect(mocked.complete).toHaveBeenCalledTimes(2);
    expect(mocked.complete.mock.calls[1]![0].messages.at(-1).content).toContain("## Вступление");
  });
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
  it("repairs the actual phase, constituent-gate and listed-endpoint defects before delivery",async()=>{
    const defects=new Map([
      ["Периоды и темы жизни","Период примерно от 30 до 50 лет связан с четвёртой линией — Оппортунистом."],
      ["Инкарнационный крест","Ворота 30 и 29 образуют канал Сияния между Эмоциональным и Корневым центрами."],
      ["Девять центров","G-центр определён. Каналы 13–33 и 23–43 связывают его с Горловым через устойчивые темы памяти."],
    ]);
    const injected=new Set<string>();
    mocked.mutate=(title,body)=>{if(defects.has(title)&&!injected.has(title)){injected.add(title);return body+"\n"+defects.get(title);}return body;};
    const deadlineAt=Date.now()+120_000,beforeRequest=vi.fn(async()=>{});
    const result=await generateHdReportSectional({chart,clientName:"Светлана",maxSectionRetries:1,deadlineAt,beforeRequest});
    expect(result.needsRegeneration).toBe(false);expect(result.quality.findings).toEqual([]);
    for(const defect of defects.values())expect(result.text).not.toContain(defect);
    const repair=mocked.complete.mock.calls.filter(([opts])=>opts.messages.at(-1).content.includes("Напиши ТОЛЬКО")).slice(HD_PIPELINE_BATCHES.length);
    expect(repair).toHaveLength(3);
    const headings=repair.flatMap(([opts])=>opts.messages.at(-1).content.split("Напиши ТОЛЬКО эти разделы с точными заголовками:\n")[1].split("\nКаждый раздел")[0].split("\n"));
    expect(new Set(headings)).toEqual(new Set([...defects.keys()].map(title=>`## ${title}`)));
    for(const [opts] of mocked.complete.mock.calls)expect(opts).toMatchObject({deadlineAt,beforeRequest,maxAttempts:1});
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
