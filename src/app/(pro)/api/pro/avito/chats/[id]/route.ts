import { NextRequest, NextResponse } from "next/server";
import { requireProPractitioner } from "@/modules/pro/auth";
import {
  getAvitoChatMessages,
  getProAvitoChat,
  markAvitoChatReadByPractitioner,
} from "@/modules/pro/avito/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;

  const { id } = await context.params;
  const [chat, messages] = await Promise.all([
    getProAvitoChat(id),
    getAvitoChatMessages(id),
  ]);
  if (!chat) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, chat, messages });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));

  if (body.action === "read") {
    const chat = await getProAvitoChat(id);
    if (!chat) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await markAvitoChatReadByPractitioner(id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
