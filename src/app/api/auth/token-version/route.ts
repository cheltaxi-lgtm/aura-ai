import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAccountTokenVersion, verifyToken } from "@/lib/auth";

const COOKIE = "aura_auth";

/**
 * Internal status for middleware revoke checks.
 * Public under /api/auth/* but only reflects the caller's own cookie.
 */
export async function GET() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ ok: false, reason: "missing" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 401 });
  }

  if (payload.role !== "user") {
    return NextResponse.json({
      ok: true,
      role: payload.role,
      sub: payload.sub,
    });
  }

  const dbTv = await getAccountTokenVersion(payload.sub);
  if (dbTv === null) {
    return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
  }

  const claimed = Number(payload.tv ?? 0) || 0;
  if (claimed !== dbTv) {
    return NextResponse.json(
      { ok: false, reason: "revoked", sub: payload.sub, tv: claimed, dbTv },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ok: true,
    role: "user",
    sub: payload.sub,
    tv: dbTv,
  });
}
