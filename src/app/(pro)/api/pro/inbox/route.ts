import { NextResponse } from "next/server";
import { requireProPractitioner } from "@/modules/pro/auth";
import {
  approveDraftMessage,
  listInbox,
  listThreadMessages,
  rejectDraftMessage,
} from "@/modules/pro/db/threads";

export async function GET(req: Request) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;
  const threadId = new URL(req.url).searchParams.get("threadId");
  if (threadId) {
    const messages = await listThreadMessages(prac.ctx.account.id, threadId);
    return NextResponse.json({ ok: true, messages });
  }
  const inbox = await listInbox(prac.ctx.account.id);
  return NextResponse.json({ ok: true, inbox });
}

export async function POST(req: Request) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;
  const body = (await req.json().catch(() => ({}))) as {
    messageId?: string;
    body?: string;
    action?: string;
    feedback?: string;
  };
  if (!body.messageId) {
    return NextResponse.json({ error: "messageId_required" }, { status: 400 });
  }
  if (body.action === "reject") {
    const ok = await rejectDraftMessage(
      prac.ctx.account.id,
      body.messageId,
      typeof body.feedback === "string" ? body.feedback : undefined
    );
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }
  const ok = await approveDraftMessage(
    prac.ctx.account.id,
    body.messageId,
    body.body
  );
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
