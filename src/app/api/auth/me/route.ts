import { NextResponse } from "next/server";
import { clearAuthCookie, getAuth } from "@/lib/auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getAuth();
  if (!auth) {
    return NextResponse.json({ authenticated: false });
  }

  let profileUserId: string | null = null;
  if (auth.role === "user") {
    profileUserId = await getProfileUserIdForAccount(auth.sub);
  }

  return NextResponse.json({
    authenticated: true,
    user: { ...auth, profileUserId },
  });
}

export async function DELETE() {
  await clearAuthCookie();
  return NextResponse.json({ ok: true });
}
