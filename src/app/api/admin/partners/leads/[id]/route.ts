import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin";
import {
  getPartnerLead,
  isValidPartnerLeadStatus,
  updatePartnerLead,
} from "@/lib/partner-leads";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  await ensureDb();
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const lead = await getPartnerLead(id);
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ lead });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  await ensureDb();
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const status =
    typeof body.status === "string" && isValidPartnerLeadStatus(body.status)
      ? body.status
      : undefined;
  const adminNote =
    body.adminNote === null
      ? null
      : typeof body.adminNote === "string"
        ? body.adminNote
        : undefined;

  const lead = await updatePartnerLead({ id, status, adminNote });
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await logAdminAction(auth.sub, "update", "partner_lead", id, {
    status: lead.status,
  });

  return NextResponse.json({ lead });
}
