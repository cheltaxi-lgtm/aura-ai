import { NextResponse } from "next/server";
import { requireProEnabled } from "@/modules/pro/gate";
import {
  resolveDeliveryByRawToken,
  touchDeliveryView,
} from "@/modules/pro/db/deliveries";
import { getCase, getCaseInput, listVersions } from "@/modules/pro/db/cases";
import { getAccountById } from "@/modules/pro/db/accounts";
import { proQuery } from "@/modules/pro/db";
import { clientAskOnDelivery } from "@/modules/pro/db/threads";
import { PRO_PUBLIC_DISCLAIMER } from "@/modules/pro/safety";
import {
  notifyProClientQuestion,
  notifyProCrisisEscalation,
} from "@/lib/email/pro-notify";
import { isProDeliveryEnabled, isProPdfEnabled } from "@/modules/pro/config";
import {
  polishProReportPlainText,
  polishProReportTitle,
} from "@/modules/pro/ai/report-plain";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const gated = requireProEnabled();
  if (gated) return gated;
  if (!isProDeliveryEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { token } = await ctx.params;
  const resolved = await resolveDeliveryByRawToken(token);
  if (!resolved) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { firstOpen } = await touchDeliveryView(resolved.delivery.id);
  const c = await getCase(resolved.accountId, resolved.caseId);
  const input = await getCaseInput(resolved.caseId);
  const versions = await listVersions(resolved.caseId);
  const human = [...versions].reverse().find((v) => v.source === "human");
  const account = await getAccountById(resolved.accountId);
  const { rows: brand } = await proQuery<{
    signature: string | null;
    extra_disclaimer: string | null;
  }>(`SELECT signature, extra_disclaimer FROM pro.brand WHERE account_id = $1`, [
    resolved.accountId,
  ]);

  // Client-visible dialog: own questions + anything sent/approved.
  // Pending AI drafts are practitioner-only and must never leak here.
  const { rows: dialogRows } = await proQuery<{
    author: string;
    body: string;
    created_at: Date;
  }>(
    `SELECT m.author, m.body, m.created_at
     FROM pro.client_threads t
     JOIN pro.thread_messages m ON m.thread_id = t.id
     WHERE t.delivery_id = $1
       AND (m.author = 'client' OR m.moderation_state IN ('approved', 'auto'))
     ORDER BY m.created_at ASC
     LIMIT 200`,
    [resolved.delivery.id]
  );
  const { rows: threadState } = await proQuery<{ questions_used: number }>(
    `SELECT questions_used FROM pro.client_threads WHERE delivery_id = $1 LIMIT 1`,
    [resolved.delivery.id]
  );

  if (firstOpen) {
    await proQuery(
      `INSERT INTO pro.audit_log (account_id, actor, action, target, meta)
       VALUES ($1, 'system', 'delivery.first_open', $2, '{}'::jsonb)`,
      [resolved.accountId, String(resolved.delivery.id)]
    );
  }

  const snapshot = (input?.payload?.chartSnapshot as Record<string, unknown>) || null;
  const blocks = (human?.blocks || []).map((b) => ({
    ...b,
    title: polishProReportTitle(String(b.title || "")),
    body: polishProReportPlainText(String(b.body || "")),
    practice:
      typeof b.practice === "string" && b.practice.trim()
        ? polishProReportPlainText(b.practice)
        : b.practice ?? null,
    eyebrow:
      typeof b.eyebrow === "string" && b.eyebrow.trim()
        ? polishProReportTitle(b.eyebrow)
        : b.eyebrow ?? null,
    sectionKind: b.sectionKind ?? null,
    arcanaNumber: b.arcanaNumber ?? null,
  }));

  const siteUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    "https://zovus.ru"
  )
    .trim()
    .replace(/\/$/, "");

  return NextResponse.json({
    ok: true,
    report: {
      brandName: account?.display_name || "Практик",
      signature: brand[0]?.signature || null,
      question: c?.question || null,
      caseType: c?.type || null,
      blocks,
      chartSnapshot: snapshot,
      pdfAvailable: isProPdfEnabled(),
      siteUrl,
      siteLabel: "zovus.ru",
      disclaimer: brand[0]?.extra_disclaimer || PRO_PUBLIC_DISCLAIMER,
      dialogMode: resolved.delivery.dialog_mode,
      dialogQuota: resolved.delivery.dialog_quota,
      questionsUsed: Number(threadState[0]?.questions_used ?? 0),
      dialog: dialogRows.map((m) => ({
        author: m.author === "client" ? "client" : "practitioner",
        body: m.body,
        at: m.created_at,
      })),
      viewCount: resolved.delivery.view_count + 1,
    },
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const gated = requireProEnabled();
  if (gated) return gated;
  if (!isProDeliveryEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { token } = await ctx.params;
  const resolved = await resolveDeliveryByRawToken(token);
  if (!resolved) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    question?: string;
    clientMsgId?: string;
  };
  if (!body.question?.trim()) {
    return NextResponse.json({ error: "question_required" }, { status: 400 });
  }
  const clientMsgId =
    typeof body.clientMsgId === "string" && /^[\w-]{8,64}$/.test(body.clientMsgId)
      ? body.clientMsgId
      : null;
  const account = await getAccountById(resolved.accountId);
  if (!account) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const result = await Promise.race([
      clientAskOnDelivery({
        deliveryId: resolved.delivery.id,
        accountId: resolved.accountId,
        caseId: resolved.caseId,
        clientId: resolved.clientId,
        userIdForBilling: account.user_id,
        question: body.question.trim(),
        dialogMode: resolved.delivery.dialog_mode,
        dialogQuota: resolved.delivery.dialog_quota,
        clientMsgId,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("ask_timeout")), 45_000)
      ),
    ]);
    if (result.status === "escalated") {
      void notifyProCrisisEscalation({
        profileUserId: account.user_id,
        caseId: resolved.caseId,
      }).catch(() => {});
    } else if (result.status !== "duplicate") {
      void notifyProClientQuestion({
        profileUserId: account.user_id,
        caseId: resolved.caseId,
        questionPreview: body.question.trim(),
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const timedOut =
      e instanceof Error && (e.message === "ask_timeout" || /timed?\s*out/i.test(e.message));
    // Errors stay in the API response — never written into report blocks.
    return NextResponse.json(
      {
        ok: false,
        error: timedOut ? "ask_timeout" : "ask_failed",
        message: timedOut
          ? "Ответ занимает слишком много времени. Попробуйте ещё раз — текст ошибки не попадает в отчёт."
          : "Не удалось обработать вопрос. Попробуйте ещё раз.",
      },
      { status: timedOut ? 504 : 502 }
    );
  }
}
