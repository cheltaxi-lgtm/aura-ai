import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  listInfluencers,
  listBloggers,
  updateInfluencerBalance,
  updateBlogger,
  logAdminAction,
} from "@/lib/admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const type = request.nextUrl.searchParams.get("type") ?? "influencers";
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);

  if (type === "bloggers") {
    return NextResponse.json({ items: await listBloggers(limit, offset) });
  }
  return NextResponse.json({ items: await listInfluencers(limit, offset) });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { entity, id, ...data } = body;

  if (entity === "influencer" && id !== undefined && data.balance !== undefined) {
    await updateInfluencerBalance(id, data.balance);
    await logAdminAction(auth.sub, "update_balance", "influencer", id, { balance: data.balance });
    return NextResponse.json({ ok: true });
  }

  if (entity === "blogger" && id) {
    await updateBlogger(id, data);
    await logAdminAction(auth.sub, "update", "blogger", id, data);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
