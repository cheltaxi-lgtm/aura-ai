import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import {
  getSupportAdminStats,
  isValidSupportStatus,
  listAdminSupportTickets,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_PRIORITY_LABELS,
  SUPPORT_STATUS_LABELS,
  type SupportStatus,
} from "@/lib/support-service";

export async function GET(request: NextRequest) {
  await ensureDb();
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const statusParam = request.nextUrl.searchParams.get("status") ?? "all";
  const status: SupportStatus | "all" =
    statusParam === "all" || isValidSupportStatus(statusParam) ? statusParam : "all";
  const unreadOnly = request.nextUrl.searchParams.get("unread") === "1";
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);

  const [tickets, stats] = await Promise.all([
    listAdminSupportTickets({ status, unreadOnly, limit, offset }),
    getSupportAdminStats(),
  ]);

  return NextResponse.json({
    tickets,
    stats,
    labels: {
      categories: SUPPORT_CATEGORY_LABELS,
      statuses: SUPPORT_STATUS_LABELS,
      priorities: SUPPORT_PRIORITY_LABELS,
    },
  });
}
