import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listSessions, listChatMessages, deleteChatMessage, logAdminAction } from "@/lib/admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const type = request.nextUrl.searchParams.get("type") ?? "sessions";
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);
  const search = request.nextUrl.searchParams.get("q") ?? undefined;

  if (type === "messages") {
    return NextResponse.json({ items: await listChatMessages(limit, offset, search) });
  }
  return NextResponse.json({ items: await listSessions(limit, offset) });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await deleteChatMessage(id);
  await logAdminAction(auth.sub, "delete", "chat_message", id);
  return NextResponse.json({ ok: true });
}
