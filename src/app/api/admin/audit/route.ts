import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listAuditLog, listKnowledge, deleteKnowledge, logAdminAction } from "@/lib/admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const type = request.nextUrl.searchParams.get("type") ?? "audit";
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);

  if (type === "knowledge") {
    return NextResponse.json({ items: await listKnowledge(limit, offset) });
  }
  return NextResponse.json({ items: await listAuditLog(limit, offset) });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await deleteKnowledge(id);
  await logAdminAction(auth.sub, "delete", "knowledge", id);
  return NextResponse.json({ ok: true });
}
