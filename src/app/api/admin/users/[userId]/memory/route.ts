import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin";
import { ensureDb, query } from "@/lib/db";
import { purgeAllUserMemory } from "@/lib/memory/user-facts";

async function ensureUser(userId: string): Promise<boolean> {
  const { rows } = await query<{ id: string }>("SELECT id FROM users WHERE id = $1", [userId]);
  return Boolean(rows[0]);
}

/** Purge all AI memory for a user. Admin cannot read memory content (152-FZ minimization). */
export async function DELETE(
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

  const { factsRemoved, sessionMemoriesRemoved } = await purgeAllUserMemory(userId);
  await logAdminAction(auth.sub, "purge_user_memory", "user", userId, {
    factsRemoved,
    sessionMemoriesRemoved,
  });
  return NextResponse.json({
    ok: true,
    factsRemoved,
    sessionMemoriesRemoved,
    deleted: factsRemoved + sessionMemoriesRemoved,
  });
}
