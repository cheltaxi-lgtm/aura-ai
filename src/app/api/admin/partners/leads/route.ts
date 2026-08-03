import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import {
  getPartnerLeadStats,
  isValidPartnerLeadStatus,
  listPartnerLeads,
  PARTNER_LEAD_STATUS_LABELS,
  type PartnerLeadStatus,
} from "@/lib/partner-leads";

export async function GET(request: NextRequest) {
  await ensureDb();
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const statusParam = request.nextUrl.searchParams.get("status") ?? "all";
  const status: PartnerLeadStatus | "all" =
    statusParam === "all" || isValidPartnerLeadStatus(statusParam) ? statusParam : "all";
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);

  const [leads, stats] = await Promise.all([
    listPartnerLeads({ status, limit, offset }),
    getPartnerLeadStats(),
  ]);

  return NextResponse.json({
    leads,
    stats,
    labels: { statuses: PARTNER_LEAD_STATUS_LABELS },
  });
}
