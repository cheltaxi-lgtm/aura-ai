import { NextRequest, NextResponse } from "next/server";
import { requireProPractitioner } from "@/modules/pro/auth";
import { isAvitoConfigured, isAvitoEnabled } from "@/lib/avito/config";
import { getAvitoProStats, listProAvitoChats } from "@/modules/pro/avito/service";

export async function GET(request: NextRequest) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;

  const unreadOnly = request.nextUrl.searchParams.get("unread") === "1";
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);

  const [chats, stats] = await Promise.all([
    listProAvitoChats({ unreadOnly, limit, offset }),
    getAvitoProStats(),
  ]);

  return NextResponse.json({
    ok: true,
    chats,
    stats,
    enabled: isAvitoEnabled(),
    configured: isAvitoConfigured(),
  });
}
