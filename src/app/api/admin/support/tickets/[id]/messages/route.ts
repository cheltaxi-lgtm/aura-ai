import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin";
import { addAdminSupportMessage } from "@/lib/support-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  await ensureDb();
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content : "";

  try {
    const message = await addAdminSupportMessage({
      adminId: auth.sub,
      ticketId: id,
      content,
    });
    if (!message) return NextResponse.json({ error: "not_found" }, { status: 404 });

    await logAdminAction(auth.sub, "reply", "support_ticket", id);
    return NextResponse.json({ message });
  } catch (err) {
    const code = err instanceof Error ? err.message : "unknown";
    if (code === "message_required") {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    if (code === "ticket_closed") {
      return NextResponse.json({ error: code }, { status: 409 });
    }
    throw err;
  }
}
