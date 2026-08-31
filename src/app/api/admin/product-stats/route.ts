import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getProductSectionStats } from "@/lib/admin-product-stats";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await getProductSectionStats();
  return NextResponse.json(data);
}
