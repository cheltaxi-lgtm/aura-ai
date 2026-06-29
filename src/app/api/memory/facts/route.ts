import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { deleteFact, listFacts } from "@/lib/memory/user-facts";

/** List or delete the authenticated user's long-term memory facts. */
export async function GET() {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "profile_required" }, { status: 400 });
  }

  const facts = await listFacts(profileUserId, 100);
  return NextResponse.json({
    facts: facts.map((f) => ({
      id: f.id,
      fact: f.fact,
      category: f.category,
      eventDate: f.eventDate,
      salience: f.salience,
    })),
    count: facts.length,
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "profile_required" }, { status: 400 });
  }

  const factId = request.nextUrl.searchParams.get("factId")?.trim();
  if (!factId) {
    return NextResponse.json({ error: "factId_required" }, { status: 400 });
  }

  const ok = await deleteFact(profileUserId, factId);
  if (!ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, deleted: 1 });
}
