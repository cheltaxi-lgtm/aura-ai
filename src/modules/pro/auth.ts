import { NextResponse } from "next/server";
import { requireProfileUserId, authRequiredResponse, needsProfileResponse } from "@/lib/require-auth";
import { requireProEnabled } from "./gate";
import { isProModuleEnabled, isProAllowlistedUser } from "./config";
import {
  applyForProAccount,
  getAccountByUserId,
  type ProAccountRow,
} from "./db/accounts";

export type ProPractitionerContext = {
  auth: { sub: string; role: string };
  profileUserId: string;
  account: ProAccountRow;
};

/** Gate + profile + active (or pending-only) pro account. */
export async function requireProPractitioner(opts?: {
  allowPending?: boolean;
}): Promise<
  | { ok: true; ctx: ProPractitionerContext }
  | { ok: false; response: NextResponse }
> {
  const gated = requireProEnabled();
  if (gated) return { ok: false, response: gated };

  const profile = await requireProfileUserId();
  if (!profile) {
    const { requireUserAuth } = await import("@/lib/require-auth");
    const auth = await requireUserAuth();
    if (!auth) return { ok: false, response: authRequiredResponse() };
    return { ok: false, response: needsProfileResponse() };
  }

  let account = await getAccountByUserId(profile.profileUserId);
  if (!account && isProAllowlistedUser(profile.profileUserId)) {
    const applied = await applyForProAccount({
      userId: profile.profileUserId,
      displayName: null,
    });
    account = applied.account;
  }
  if (!account) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "pro_account_required", message: "Подайте заявку в Zovus Pro" },
        { status: 403 }
      ),
    };
  }
  if (account.status === "suspended" || account.status === "closed") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "pro_account_inactive", status: account.status },
        { status: 403 }
      ),
    };
  }
  if (account.status === "pending" && !opts?.allowPending) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "pro_account_pending", message: "Заявка на рассмотрении" },
        { status: 403 }
      ),
    };
  }
  if (account.status !== "active" && account.status !== "pending") {
    return {
      ok: false,
      response: NextResponse.json({ error: "pro_account_inactive" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    ctx: {
      auth: profile.auth,
      profileUserId: profile.profileUserId,
      account,
    },
  };
}

export function proModuleMustBeOn(): NextResponse | null {
  if (!isProModuleEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return null;
}
