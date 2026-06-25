import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { listDiaryEntries } from "@/lib/diary";

export async function GET(_request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  const dbOk = await ensureDb();
  if (!dbOk) {
    return NextResponse.json({ entries: [] });
  }

  const userId = await getProfileUserIdForAccount(auth.sub);
  if (!userId) {
    return NextResponse.json({ entries: [] });
  }

  const entries = await listDiaryEntries(userId, 20);
  return NextResponse.json({ entries });
}
