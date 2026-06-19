import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { findExpertById, getExpertStats } from "@/lib/accounts";
import { query } from "@/lib/db";

export async function GET() {
  const auth = await getAuth();
  if (!auth || auth.role !== "expert") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expert = await findExpertById(auth.sub);
  if (!expert) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stats = await getExpertStats(expert.slug);

  const { rows: knowledge } = await query<{ id: string; title: string | null; created_at: Date }>(
    `SELECT bk.id, bk.title, bk.created_at FROM blogger_knowledge bk
     JOIN bloggers b ON b.id = bk.blogger_id WHERE b.slug = $1
     ORDER BY bk.created_at DESC LIMIT 10`,
    [expert.slug]
  );

  return NextResponse.json({ profile: expert, stats, knowledge });
}
