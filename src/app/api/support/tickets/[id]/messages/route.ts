import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { enforceRecaptchaScope } from "@/lib/recaptcha-guard";
import { addUserSupportMessage } from "@/lib/support-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  await ensureDb();
  const auth = await requireUserAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content : "";
  const recaptchaToken = typeof body.recaptchaToken === "string" ? body.recaptchaToken : undefined;

  try {
    const captchaBlock = await enforceRecaptchaScope("support", recaptchaToken, request);
    if (captchaBlock) return captchaBlock;

    const message = await addUserSupportMessage({
      userAccountId: auth.sub,
      ticketId: id,
      content,
    });
    if (!message) return NextResponse.json({ error: "not_found" }, { status: 404 });
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
