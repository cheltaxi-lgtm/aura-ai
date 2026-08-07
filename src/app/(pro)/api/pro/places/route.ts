import { NextRequest, NextResponse } from "next/server";
import { requireProPractitioner } from "@/modules/pro/auth";
import { geocodeAdapter } from "@/modules/pro/adapters";

export async function GET(request: NextRequest) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ places: [] });
  }

  try {
    const places = await geocodeAdapter.search(q, 8);
    return NextResponse.json({ places });
  } catch {
    return NextResponse.json({ places: [] });
  }
}
