import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { countUnreadSupportTicketsForUser } from "@/lib/support-service";

export async function GET() {
  await ensureDb();
  const auth = await requireUserAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const unread = await countUnreadSupportTicketsForUser(auth.sub);
  return NextResponse.json({ unread });
}
