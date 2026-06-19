import { NextResponse } from "next/server";
import { ensureDb, query } from "@/lib/db";

export async function GET() {
  if (!(await ensureDb())) {
    return NextResponse.json({ packages: [] });
  }

  const { rows } = await query<{
    id: string;
    name: string;
    runes: number;
    price_rub: number;
    bonus_runes: number;
    is_popular: boolean;
    sort_order: number;
  }>("SELECT * FROM rune_packages ORDER BY sort_order ASC");

  return NextResponse.json({ packages: rows });
}
