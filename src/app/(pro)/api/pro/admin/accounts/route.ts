import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { requireProEnabled } from "@/modules/pro/gate";
import { listAccounts, setAccountStatus } from "@/modules/pro/db/accounts";

export async function GET() {
  const gated = requireProEnabled();
  if (gated) return gated;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const accounts = await listAccounts(200);
  return NextResponse.json({
    ok: true,
    accounts: accounts.map((a) => ({
      id: a.id,
      user_id: a.user_id,
      status: a.status,
      tier: a.tier,
      display_name: a.display_name,
      brand_slug: a.brand_slug,
      created_at: a.created_at,
    })),
  });
}

export async function PATCH(req: Request) {
  const gated = requireProEnabled();
  if (gated) return gated;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    status?: "pending" | "active" | "suspended" | "closed";
  };
  if (!body.id || !body.status) {
    return NextResponse.json({ error: "id_and_status_required" }, { status: 400 });
  }
  const account = await setAccountStatus(body.id, body.status, admin.sub);
  if (!account) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, account });
}
