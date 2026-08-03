import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin";
import { addAdminSupportMessage, getAdminSupportTicket } from "@/lib/support-service";
import { emailSupportReplyToUser } from "@/lib/email/support-notify";
import { getTelegramStatusForAccount } from "@/lib/telegram/accounts";
import { notifyBotSupportReply } from "@/lib/telegram/notify-bot-support";

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

    const ticket = await getAdminSupportTicket(id);
    if (ticket?.user_email) {
      void emailSupportReplyToUser({
        userEmail: ticket.user_email,
        userName: ticket.user_name ?? ticket.user_email,
        ticketId: id,
        subject: ticket.subject,
        replyPreview: message.content,
      });
    }

    if (ticket?.user_account_id) {
      void getTelegramStatusForAccount(ticket.user_account_id).then((tg) => {
        if (!tg.linked || !tg.telegramUserId) return;
        const telegramUserId = Number(tg.telegramUserId);
        if (!Number.isInteger(telegramUserId) || telegramUserId <= 0) return;
        void notifyBotSupportReply({
          telegramUserId,
          ticketId: id,
          subject: ticket.subject,
          preview: message.content,
        });
      });
    }

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
