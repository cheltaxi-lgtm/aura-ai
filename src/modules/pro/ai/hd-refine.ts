import { completeChatDetailed } from "@/lib/llm";
import { getHdModel } from "@/lib/ai-model";
import { formatHdEvidence } from "@/lib/human-design/prompt";
import type { HdChart } from "@/lib/human-design/types";
import { buildHdLockedContract } from "@/lib/hd-report-pipeline/contract";
import { validateHdReportText } from "@/lib/hd-report-quality/validator";
import { resolveCostRubFromUsage } from "@/lib/hd-report-pipeline/cost";
import type { ProReportBlock } from "../domain/types";
import type { ProChartSnapshot } from "./generate-premium";
import { normalizeProPremiumBlocks } from "./pro-premium-normalize";
import { polishProReportPlainText } from "./report-plain";

export const hdProBlocksText=(blocks:ProReportBlock[])=>blocks.map(b=>`## ${b.title}\n`+b.body+(b.practice?`\n\nПрактика: ${b.practice}`:"")).join("\n\n");

export async function refineProHdReport(opts:{blocks:ProReportBlock[];snapshot:ProChartSnapshot;blockIndex:number;instruction:string;clientAlias:string;question:string|null;deadlineAt:number;beforeRequest:()=>Promise<void>}) {
  const chart=opts.snapshot.hdChart as unknown as HdChart;
  const original=opts.blocks[opts.blockIndex];
  if(!chart||!original)throw new Error("hd_refine_source_missing");
  const contract=buildHdLockedContract(chart);
  const modelId=await getHdModel();
  const completion=await completeChatDetailed({modelOverride:modelId,isPaid:true,priority:"report",maxTokens:5000,maxAttempts:1,skipTemperatureRetry:true,deadlineAt:opts.deadlineAt,beforeRequest:opts.beforeRequest,messages:[
    {role:"system",content:`Перепиши одну секцию Дизайна Человека для клиента на «Вы». Сохрани объём, корректные факты и конкретную практику. Верни текст без заголовка и служебных комментариев. Не выдавай неизвестное время за точные свойства.\n${contract.contractBlock}\n${formatHdEvidence(chart)}`},
    {role:"user",content:`Секция: ${original.title}. Клиент: ${opts.clientAlias}. Запрос: ${opts.question??"не указан"}.\n${original.body}${original.practice?`\nПрактика: ${original.practice}`:""}\nИнструкция: ${opts.instruction}`}
  ]});
  if(completion.finishReason!=="stop"||!completion.text?.trim())throw new Error("hd_refine_incomplete");
  const text=completion.text;
  const blocks=normalizeProPremiumBlocks(opts.blocks.map((b,i)=>i===opts.blockIndex?{...b,body:polishProReportPlainText(text),practice:null}:b),{clientAlias:opts.clientAlias,focus:opts.question,caseType:"hd"});
  const quality=validateHdReportText(hdProBlocksText(blocks),{contract});
  if(!quality.ok)throw Object.assign(new Error("hd_quality_needs_regeneration"),{qualityFindings:quality.findings});
  const usage={promptTokens:completion.usage?.promptTokens??0,completionTokens:completion.usage?.completionTokens??0,complete:Number.isFinite(completion.usage?.promptTokens)&&Number.isFinite(completion.usage?.completionTokens)};
  const cost=await resolveCostRubFromUsage(usage,modelId);
  return {blocks,snapshot:opts.snapshot,uncertaintyMarks:[],aiTelemetry:{modelId,usage,llmCalls:1,costRub:usage.complete?cost.rub:null}};
}
