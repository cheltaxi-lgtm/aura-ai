import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { requireAdminStepUp } from "@/lib/admin-stepup";
import { queryClient, withTransaction } from "@/lib/db";
import { listUserAccounts, listOnboardingProfiles } from "@/lib/admin";
import { requestAccountErasure } from "@/lib/account-erasure";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (typeof id !== "string" || !UUID.test(id)) {
    return NextResponse.json({ error: "valid id required" }, { status: 400 });
  }

  try {
    const result = await requestAccountErasure(id, { adminActorId: auth.sub });
    return NextResponse.json({ ok: true, ...result }, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.message === "account_not_found") {
      return NextResponse.json({ error: "account_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "erasure_unavailable" }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  const stepped = await requireAdminStepUp(request);
  if (!stepped.ok) return stepped.response;
  const auth = stepped.auth;

  const body = await request.json().catch(() => ({}));
  const id = body.id as string | undefined;
  const isUnlimited = body.isUnlimited as boolean | undefined;
  const isInternal = body.isInternal as boolean | undefined;

  if (!id || !UUID.test(id) || (typeof isUnlimited !== "boolean" && typeof isInternal !== "boolean")) {
    return NextResponse.json({ error: "id and preference required" }, { status: 400 });
  }

  await withTransaction(async (client) => {
    const updated = await queryClient(
      client,
      `UPDATE user_accounts SET
         is_unlimited=COALESCE($2::boolean,is_unlimited),
         is_internal=COALESCE($3::boolean,is_internal)
       WHERE id=$1 RETURNING id`,
      [id, typeof isUnlimited === "boolean" ? isUnlimited : null, typeof isInternal === "boolean" ? isInternal : null]
    );
    if (!updated.rowCount) throw new Error("account_not_found");
    const actions = [
      typeof isUnlimited === "boolean" ? (isUnlimited ? "grant_unlimited" : "revoke_unlimited") : null,
      typeof isInternal === "boolean" ? (isInternal ? "mark_internal" : "unmark_internal") : null,
    ].filter((action): action is string => Boolean(action));
    for (const action of actions) {
      await queryClient(
        client,
        `INSERT INTO admin_audit_log(admin_id,action,entity_type,entity_id,details)
         VALUES($1,$2,'user_account',$3,'{}'::jsonb)`,
        [auth.sub, action, id]
      );
    }
  });
  return NextResponse.json({ ok: true, isUnlimited, isInternal });
}
