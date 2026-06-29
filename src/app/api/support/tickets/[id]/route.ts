import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import {
  closeTicketByUser,
  getSupportTicketMessages,
  getUserSupportTicket,
  markTicketReadByUser,
} from "@/lib/support-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  await ensureDb();
  const auth = await requireUserAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const ticket = await getUserSupportTicket(auth.sub, id);
  if (!ticket) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await markTicketReadByUser(auth.sub, id);
  const messages = await getSupportTicketMessages(id);

  return NextResponse.json({ ticket: { ...ticket, unread_by_user: false }, messages });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  await ensureDb();
  const auth = await requireUserAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));

  if (body.action === "close") {
    const ok = await closeTicketByUser(auth.sub, id);
    if (!ok) return NextResponse.json({ error: "not_found_or_closed" }, { status: 400 });
    const ticket = await getUserSupportTicket(auth.sub, id);
    return NextResponse.json({ ticket });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
