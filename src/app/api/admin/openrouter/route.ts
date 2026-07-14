import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  getOpenRouterAdminSnapshot,
  invalidateOpenRouterAdminCache,
} from "@/lib/openrouter-admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const force = request.nextUrl.searchParams.get("refresh") === "1";
  if (force) invalidateOpenRouterAdminCache();

  const snapshot = await getOpenRouterAdminSnapshot(force);
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
