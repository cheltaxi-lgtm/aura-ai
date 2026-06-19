import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listExperts, updateExpert, logAdminAction } from "@/lib/admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);
  return NextResponse.json({ items: await listExperts(limit, offset) });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, ...data } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await updateExpert(id, data);
  await logAdminAction(auth.sub, "update", "expert", id, data);
  return NextResponse.json({ ok: true });
}
