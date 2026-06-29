import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin";
import {
  getAdminSupportTicket,
  getSupportTicketMessages,
  isValidSupportPriority,
  isValidSupportStatus,
  markTicketReadByAdmin,
  updateAdminSupportTicket,
} from "@/lib/support-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  await ensureDb();
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const ticket = await getAdminSupportTicket(id);
  if (!ticket) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await markTicketReadByAdmin(id);
  const messages = await getSupportTicketMessages(id);

  return NextResponse.json({
    ticket: { ...ticket, unread_by_admin: false },
    messages,
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  await ensureDb();
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));

  const status =
    typeof body.status === "string" && isValidSupportStatus(body.status)
      ? body.status
      : undefined;
  const priority =
    typeof body.priority === "string" && isValidSupportPriority(body.priority)
      ? body.priority
      : undefined;
  const assignedAdminId =
    body.assignedAdminId === null
      ? null
      : typeof body.assignedAdminId === "string"
        ? body.assignedAdminId
        : undefined;

  const ticket = await updateAdminSupportTicket({
    adminId: auth.sub,
    ticketId: id,
    status,
    priority,
    assignedAdminId,
  });

  if (!ticket) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await logAdminAction(auth.sub, "update", "support_ticket", id, {
    status,
    priority,
    assignedAdminId,
  });

  return NextResponse.json({ ticket });
}
