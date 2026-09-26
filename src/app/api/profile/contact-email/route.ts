import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  getContactEmailStatus,
  normalizeContactEmail,
  removeContactEmail,
  requestContactEmailVerification,
  verifyContactEmail,
} from "@/lib/contact-email";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await ensureDb())) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json(await getContactEmailStatus(auth.auth.sub), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await ensureDb())) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const limit = await checkRateLimit(`contact-email:send:${auth.auth.sub}`, 3, 3_600_000);
  if (!limit.allowed) return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  const body = await request.json().catch(() => null);
  const email = normalizeContactEmail(body?.email);
  if (!email || typeof body?.dailyReminder !== "boolean") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const result = await requestContactEmailVerification({
    accountId: auth.auth.sub,
    email,
    dailyReminder: body.dailyReminder,
  });
  if (result === "already_available") return NextResponse.json({ error: result }, { status: 409 });
  if (result === "send_failed") return NextResponse.json({ error: result }, { status: 503 });
  // Do not disclose whether an address is already used by another account.
  return NextResponse.json({ ok: true });
}

export async function PUT(request: NextRequest) {
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await ensureDb())) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const limit = await checkRateLimit(`contact-email:verify:${auth.auth.sub}`, 10, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  const body = await request.json().catch(() => null);
  if (typeof body?.token !== "string" || body.token.length > 4096) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, ...await verifyContactEmail(auth.auth.sub, body.token) });
  } catch {
    return NextResponse.json({ error: "invalid_verification" }, { status: 400 });
  }
}

export async function DELETE() {
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await ensureDb())) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const limit = await checkRateLimit(`contact-email:remove:${auth.auth.sub}`, 5, 3_600_000);
  if (!limit.allowed) return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  await removeContactEmail(auth.auth.sub);
  return NextResponse.json(await getContactEmailStatus(auth.auth.sub));
}
