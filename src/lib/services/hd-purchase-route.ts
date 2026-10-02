import { NextRequest, NextResponse } from "next/server";
import { profileAuthFailureResponse, resolveProfileUserContext } from "@/lib/require-auth";
import { isHumanDesignEnabled } from "@/lib/settings";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { isHardRejectedLlmOutput, isOpenRouterConfigured } from "@/lib/llm";
import { resolveUnlimitedAccess } from "@/lib/accounts";
import { getRuneSettings } from "@/lib/rune-settings";
import { isRuneBillingActive } from "@/lib/rune-service";
import { ensureSufficientRunes, InsufficientFundsError } from "./billing-service";
import { getAsyncJobWorkerUserId, getReportWorkerJobFromRequest, isAsyncJobWorkerConfigured } from "@/lib/async-job-worker-auth";
import { enqueuePaidAsyncJob } from "@/lib/async-job-enqueue";
import { makeWorkerProgressReporter, shouldRefundBeforeWorkerFail, trackWorkerJobCompleted, trackWorkerJobFailed } from "@/lib/async-job-lifecycle";
import { query } from "@/lib/db";
import { getUserById } from "@/lib/users";
import { AGE_REQUIRED_ERROR, isUserAgeEligible } from "@/lib/age-gate";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
import {
  getHdChartById, getHdReportForChart, getHdCompositeReport, hasRuneRefundForTransaction,
  HD_UUID_RE, mapHdRelationToSelf, toPublicHdReport, toPublicHdCompositeReport,
} from "./human-design-service";
import {
  acquireHdGeneration, assertHdGenerationCurrent, failHdGeneration, saveHdGeneration,
  hdPurchaseIdentity, HdGenerationConflict, type HdGenerationGuard,
} from "./hd-generation-service";
import {
  HD_ENGINE_VERSION, HD_CONNECTION_RELATIONS, connectionRelationPromptHint,
  formatHdConnectionEvidence, buildHdCompositeReportSystemPrompt, sanitizeHdCompositeReportText,
  type HdConnectionRelation,
} from "@/lib/human-design";
import { buildHdReportSystemPrompt, formatHdEvidence, sanitizeHdReportText } from "@/lib/human-design/prompt";
import { generateHdReportSectional } from "@/lib/hd-report-pipeline/generate";
import { isHdSectionalReportEnabled } from "@/lib/hd-report-pipeline/flags";
import { completeHdFullReport, completeHdCompositeReport } from "@/lib/human-design/report-generate";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { appendHdPersonalizationLens } from "@/lib/human-design/personalization-lens";
import { captureMemoryGenerationForRequest } from "@/lib/memory/request-capture";
import { rememberHdChartFact } from "@/lib/human-design/memory";

const DISCLAIMER = "\n\n---\nРазбор является символической интерпретацией системы Дизайна Человека и не заменяет профессиональную консультацию.";

export async function handleHdPurchase(request: NextRequest, kind: HdGenerationGuard["kind"]) {
  const started = Date.now();
  if (!(await isHumanDesignEnabled())) return NextResponse.json({ error: "Feature disabled" },{status:404});
  const workerUser = getAsyncJobWorkerUserId(request);
  const worker = getReportWorkerJobFromRequest(request);
  if (workerUser && !worker) return NextResponse.json({error:"invalid_worker_attempt"},{status:403});
  let userId = workerUser;
  if (!userId) {
    const auth = await resolveProfileUserContext();
    if (!auth.ok) return profileAuthFailureResponse(auth.reason);
    userId = auth.profileUserId;
    const limited = await enforcePaidRouteRateLimit(userId,"hd_report");
    if (limited) return limited;
  }
  const raw: unknown = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NextResponse.json({error:"Некорректный запрос."},{status:400});
  const body = raw as Record<string,unknown>;
  if (body.aiDataUseAcknowledged !== true) return NextResponse.json({error:"Подтвердите передачу рассчитанных данных карты внешней языковой модели."},{status:400});
  if (body.regenerate === true) return NextResponse.json({error:"Пересборка разбора недоступна. Уже оплаченный текст остаётся как есть."},{status:400});
  const ids = kind === "personal" ? [body.chartId] : [body.baseChartId,body.partnerChartId];
  if (ids.some(id => typeof id !== "string" || !HD_UUID_RE.test(id)) || new Set(ids).size !== ids.length) return NextResponse.json({error:"Укажите разные карты."},{status:400});
  const profile = await getUserById(userId).catch(() => null);
  const active = (await query("SELECT id FROM users WHERE id=$1 AND erasure_requested_at IS NULL",[userId])).rows.length > 0;
  if (!active) return NextResponse.json({error:"account_inactive"},{status:403});
  if (!profile || !isUserAgeEligible(profile)) return NextResponse.json(AGE_REQUIRED_ERROR,{status:403});
  const fetched = await Promise.all((ids as string[]).map(getHdChartById));
  if (fetched.some(c => !c || c.userId !== userId)) return NextResponse.json({error:"Карта не найдена."},{status:404});
  const charts = fetched.map(c => c!);
  if (charts.some(c => c.engineVersion !== HD_ENGINE_VERSION)) return NextResponse.json({error:"Не удалось обновить расчёт карты. Попробуйте снова."},{status:409});
  const relation = (typeof body.relation === "string" && HD_CONNECTION_RELATIONS.some(r => r.id === body.relation) ? body.relation : mapHdRelationToSelf(charts[1]?.relationToSelf) ?? "partner") as HdConnectionRelation;
  const subjectName = (c: typeof charts[number]) => normalizePersonDisplayName(c.subjectKind === "other" ? c.subjectName : profile.name) || "этот человек";
  const context = kind === "personal" ? { tone:"personal", sku:"max", name:subjectName(charts[0]) } : { relation, names:charts.map(subjectName) };
  const table = kind === "personal" ? "hd_reports" : "hd_composite_reports";
  const existing = kind === "personal" ? await getHdReportForChart(charts[0].id,userId) : await getHdCompositeReport(charts[0].id,charts[1].id,userId);
  const readable = existing?.reportText?.trim() && (existing.status === "done" || (existing.status === "pending" && (kind === "composite" || ("adminRewriteStartedAt" in existing && existing.adminRewriteStartedAt))));
  if (!isOpenRouterConfigured() && !readable) return NextResponse.json({error:"Генерация временно недоступна."},{status:503});
  const unlimited = await resolveUnlimitedAccess({profileUserId:userId});
  const exempt = !isRuneBillingActive(userId,unlimited,await getRuneSettings());
  let guard: HdGenerationGuard | undefined;
  try {
    if (body.async === true && !worker && !readable && isAsyncJobWorkerConfigured()) {
      const held = existing?.transactionId && !(await hasRuneRefundForTransaction(existing.transactionId));
      const duplicate = (await query(`SELECT id FROM ${table} WHERE user_id=$1 AND semantic_identity=$2 AND status='done' AND report_text IS NOT NULL LIMIT 1`,[userId,hdPurchaseIdentity(charts,context)])).rows[0];
      if (!held && !duplicate) await ensureSufficientRunes({userId,action:kind === "personal" ? "HD_REPORT" : "HD_COMPOSITE_REPORT",exempt});
      return enqueuePaidAsyncJob({userId,kind:kind === "personal" ? "hd_report" : "hd_composite_report",
        payload: kind === "personal" ? { chartId:charts[0].id,aiDataUseAcknowledged:true } : {baseChartId:charts[0].id,partnerChartId:charts[1].id,relation,aiDataUseAcknowledged:true},bypassDeliveryGate:true});
    }
    const purchase = await acquireHdGeneration({kind,userId,charts,exempt,worker,context});
    if ("cached" in purchase) return NextResponse.json({...purchase.cached,cached:true});
    guard = purchase.guard;
    const frozen = purchase.charts;
    const beforeRequest = () => assertHdGenerationCurrent(purchase.guard);
    const deadlineAt = started + (kind === "personal" ? 720_000 : 540_000);
    let text: string | null;
    let model = "openrouter";
    let meta: {costRub:number|null;usage:unknown;calls:number}|undefined;
    let defective = false;
    let findings: unknown = [];
    const capture = await captureMemoryGenerationForRequest(request,userId);
    if (kind === "personal") {
      const subject = frozen[0];
      const aboutOther = subject.subjectKind === "other";
      const clientName = typeof purchase.context.name === "string" ? purchase.context.name : subjectName(subject);
      const lens = aboutOther ? "" : await appendHdPersonalizationLens("",{profileUserId:userId,user:profile});
      if (isHdSectionalReportEnabled()) {
        const generated = await generateHdReportSectional({chart:subject.chart,clientName,aboutOther,placeLabel:subject.placeName,
          gender:aboutOther ? subject.gender : null,extraSystem:lens || null,maxSectionRetries:2,deadlineAt,beforeRequest,onProgress:makeWorkerProgressReporter(request)});
        text = generated.text; defective = generated.needsRegeneration; findings = generated.quality.findings;
        model = generated.modelId; meta = {costRub:generated.costRub,usage:generated.usage,calls:generated.llmCalls};
      } else text = await completeHdFullReport({systemPrompt:buildHdReportSystemPrompt(clientName,"personal",{aboutOther}),
        evidence:formatHdEvidence(subject.chart,{placeLabel:subject.placeName}),chart:subject.chart,clientName,aboutOther,deadlineAt,beforeRequest});
    } else {
      const [a,b] = frozen;
      const names = Array.isArray(purchase.context.names) ? purchase.context.names : null;
      const nameA = typeof names?.[0] === "string" ? names[0] : subjectName(a), nameB = typeof names?.[1] === "string" ? names[1] : subjectName(b);
      const frozenRelation = typeof purchase.context.relation === "string" ? purchase.context.relation as HdConnectionRelation : relation;
      text = await completeHdCompositeReport({systemPrompt:await wrapSystemPrompt(buildHdCompositeReportSystemPrompt(nameA,nameB,connectionRelationPromptHint(frozenRelation))),
        evidence:formatHdConnectionEvidence(a.chart,b.chart,{a:nameA,b:nameB}),charts:{a:a.chart,b:b.chart},nameA,nameB,deadlineAt,beforeRequest});
    }
    if (!text || defective || isHardRejectedLlmOutput(text)) {
      const errorCode = "invalid_model_output";
      const refund = await shouldRefundBeforeWorkerFail(request,errorCode);
      const refunded = await failHdGeneration(guard,errorCode,refund,text ? {text:sanitizeHdReportText(text),findings} : undefined);
      const message = refunded ? "Не удалось завершить разбор. Оплата возвращена." : worker ? "Разбор проходит повторную проверку. Оплата сохранена, повторного списания не будет." : "Не удалось завершить разбор. Повторите попытку без повторного списания.";
      await trackWorkerJobFailed(request,message,{errorCode,refunded});
      return NextResponse.json({error:message,code:errorCode,refunded},{status:502});
    }
    const clean = kind === "personal" ? sanitizeHdReportText(text) : sanitizeHdCompositeReportText(text);
    const result = await saveHdGeneration(guard,clean + DISCLAIMER,model,frozen,meta);
    if (!result) throw new HdGenerationConflict("stale_hd_generation");
    if (kind === "personal" && frozen[0].subjectKind === "self") await rememberHdChartFact(userId,frozen[0].chart,frozen[0].id,capture).catch(() => undefined);
    return NextResponse.json({...result,runeBalance:purchase.charge.newBalance});
  } catch (error) {
    if (error instanceof InsufficientFundsError) {
      await trackWorkerJobFailed(request,"Недостаточно рун для этого действия.",{errorCode:"insufficient_runes"});
      return NextResponse.json({error:"insufficient_runes",message:"Недостаточно рун для этого действия.",balance:error.balance,required:error.required,cost:error.required},{status:402});
    }
    if (error instanceof HdGenerationConflict) return NextResponse.json({error:error.message === "account_inactive" ? "Аккаунт недоступен." : "Состояние разбора изменилось. Обновите страницу.",code:error.message},{status:error.message === "account_inactive" ? 403 : 409});
    const refund = await shouldRefundBeforeWorkerFail(request,"generation_failed");
    const refunded = guard ? await failHdGeneration(guard,"generation_failed",refund).catch(() => false) : false;
    await trackWorkerJobFailed(request,"Не удалось завершить разбор.",{errorCode:"generation_failed",refunded});
    console.warn("[human-design] generation failed",error instanceof Error ? error.message : "unknown");
    return NextResponse.json({error:refunded ? "Не удалось завершить разбор. Оплата возвращена." : "Не удалось завершить разбор. Повторное списание не потребуется.",refunded},{status:502});
  }
}
