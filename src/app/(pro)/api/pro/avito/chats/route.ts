import { NextRequest, NextResponse } from "next/server";
import { requireProPractitioner } from "@/modules/pro/auth";
import { isAvitoConfigured, isAvitoEnabled } from "@/lib/avito/config";
import {
  getAvitoProAccess,
  getAvitoProStats,
  listProAvitoChats,
} from "@/modules/pro/avito/service";

export async function GET(request: NextRequest) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;

  const access = await getAvitoProAccess(prac.ctx.account.id);
  if (!access.allowed) {
    return NextResponse.json({
      ok: true,
      chats: [],
      stats: { total: 0, unread: 0 },
      enabled: isAvitoEnabled(),
      configured: isAvitoConfigured(),
      ownerOnly: true,
    });
  }

  const unreadOnly = request.nextUrl.searchParams.get("unread") === "1";
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);

  const [chats, stats] = await Promise.all([
    listProAvitoChats({ accountId: prac.ctx.account.id, unreadOnly, limit, offset }),
    getAvitoProStats(prac.ctx.account.id),
  ]);

  return NextResponse.json({
    ok: true,
    chats,
    stats,
    enabled: isAvitoEnabled(),
    configured: isAvitoConfigured(),
  });
}
