import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { requireAdminStepUp } from "@/lib/admin-stepup";
import { logAdminAction } from "@/lib/admin";
import {
  getOpenRouterAdminSnapshot,
  invalidateOpenRouterAdminCache,
  saveOpenRouterManagementKey,
} from "@/lib/openrouter-admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const force = request.nextUrl.searchParams.get("refresh") === "1";
  if (force) invalidateOpenRouterAdminCache();

  const snapshot = await getOpenRouterAdminSnapshot(force);
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest) {
  const stepped = await requireAdminStepUp(request);
  if (!stepped.ok) return stepped.response;
  const auth = stepped.auth;

  const body = (await request.json().catch(() => ({}))) as { managementKey?: unknown };
  if (typeof body.managementKey !== "string") {
    return NextResponse.json({ error: "managementKey required" }, { status: 400 });
  }

  const result = await saveOpenRouterManagementKey(body.managementKey, auth.sub);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await logAdminAction(auth.sub, "update_settings", "openrouter", "managementKey", {
    configured: Boolean(body.managementKey.trim()),
  });

  const snapshot = await getOpenRouterAdminSnapshot(true);
  return NextResponse.json({
    ok: true,
    cleared: !body.managementKey.trim(),
    activityAvailable: snapshot.activityAvailable,
    managementKeyConfigured: snapshot.managementKeyConfigured,
    managementKeyHint: snapshot.managementKeyHint,
    managementKeySource: snapshot.managementKeySource,
    snapshot,
  });
}
