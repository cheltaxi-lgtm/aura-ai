import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { enforceRecaptchaScope } from "@/lib/recaptcha-guard";
import {
  createSupportTicket,
  isValidSupportCategory,
  listUserSupportTickets,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUS_LABELS,
} from "@/lib/support-service";

export async function GET() {
  await ensureDb();
  const auth = await requireUserAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tickets = await listUserSupportTickets(auth.sub);
  return NextResponse.json({
    tickets,
    labels: { categories: SUPPORT_CATEGORY_LABELS, statuses: SUPPORT_STATUS_LABELS },
  });
}

export async function POST(request: NextRequest) {
  await ensureDb();
  const auth = await requireUserAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const subject = typeof body.subject === "string" ? body.subject : "";
  const message = typeof body.message === "string" ? body.message : "";
  const recaptchaToken = typeof body.recaptchaToken === "string" ? body.recaptchaToken : undefined;
  const category =
    typeof body.category === "string" && isValidSupportCategory(body.category)
      ? body.category
      : "general";

  try {
    const captchaBlock = await enforceRecaptchaScope("support", recaptchaToken, request);
    if (captchaBlock) return captchaBlock;

    const { ticket, message: firstMessage, autoReply } = await createSupportTicket({
      userAccountId: auth.sub,
      subject,
      category,
      message,
    });
    return NextResponse.json({ ticket, message: firstMessage, autoReply }, { status: 201 });
  } catch (err) {
    const code = err instanceof Error ? err.message : "unknown";
    if (code === "subject_required" || code === "message_required") {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    throw err;
  }
}
