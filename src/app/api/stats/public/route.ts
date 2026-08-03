import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { testAccountEmailSql } from "@/lib/test-accounts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { rows } = await query<{ sessions: string; users: string }>(`
      SELECT
        (SELECT COUNT(*) FROM sessions)::text AS sessions,
        (SELECT COUNT(*) FROM user_accounts ua WHERE NOT ${testAccountEmailSql("ua.email")})::text AS users
    `);
    const sessions = Math.max(0, parseInt(rows[0]?.sessions ?? "0", 10));
    const users = Math.max(0, parseInt(rows[0]?.users ?? "0", 10));
    return NextResponse.json(
      { sessions, users },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
        },
      }
    );
  } catch {
    return NextResponse.json({ sessions: 0, users: 0 });
  }
}
