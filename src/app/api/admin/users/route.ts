import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { requireAdminStepUp } from "@/lib/admin-stepup";
import { setUserAccountUnlimited } from "@/lib/accounts";
import { listUserAccounts, listOnboardingProfiles, deleteUserAccount, logAdminAction } from "@/lib/admin";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const type = request.nextUrl.searchParams.get("type") ?? "accounts";
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);
  const includeTest = request.nextUrl.searchParams.get("includeTest") === "1";

  if (type === "profiles") {
    return NextResponse.json({ items: await listOnboardingProfiles(limit, offset, includeTest) });
  }
  return NextResponse.json({ items: await listUserAccounts(limit, offset, includeTest) });
}

export async function DELETE(request: NextRequest) {
  const stepped = await requireAdminStepUp(request);
  if (!stepped.ok) return stepped.response;
  const auth = stepped.auth;

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await deleteUserAccount(id);
  await logAdminAction(auth.sub, "delete", "user_account", id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const stepped = await requireAdminStepUp(request);
  if (!stepped.ok) return stepped.response;
  const auth = stepped.auth;

  const body = await request.json().catch(() => ({}));
  const id = body.id as string | undefined;
  const isUnlimited = body.isUnlimited as boolean | undefined;

  if (!id || typeof isUnlimited !== "boolean") {
    return NextResponse.json({ error: "id and isUnlimited required" }, { status: 400 });
  }

  await setUserAccountUnlimited(id, isUnlimited);
  await logAdminAction(auth.sub, isUnlimited ? "grant_unlimited" : "revoke_unlimited", "user_account", id);
  return NextResponse.json({ ok: true, isUnlimited });
}
