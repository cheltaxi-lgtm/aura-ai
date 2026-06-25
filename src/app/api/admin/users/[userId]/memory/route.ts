import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin";
import { ensureDb, query } from "@/lib/db";
import { deleteFact, listFacts, purgeFacts } from "@/lib/memory/user-facts";

async function ensureUser(userId: string): Promise<boolean> {
  const { rows } = await query<{ id: string }>("SELECT id FROM users WHERE id = $1", [userId]);
  return Boolean(rows[0]);
}

/** List a user's long-term memory facts. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { userId } = await params;
  if (!userId || !(await ensureUser(userId))) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const facts = await listFacts(userId, 200);
  return NextResponse.json({ facts, count: facts.length });
}

/** Delete one fact (?factId=) or purge all facts for the user. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { userId } = await params;
  if (!userId || !(await ensureUser(userId))) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const factId = request.nextUrl.searchParams.get("factId")?.trim();

  if (factId) {
    const ok = await deleteFact(userId, factId);
    await logAdminAction(auth.sub, "delete_user_fact", "user", userId, { factId });
    return NextResponse.json({ ok, deleted: ok ? 1 : 0 });
  }

  const deleted = await purgeFacts(userId);
  await logAdminAction(auth.sub, "purge_user_facts", "user", userId, { deleted });
  return NextResponse.json({ ok: true, deleted });
}
