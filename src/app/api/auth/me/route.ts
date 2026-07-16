import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookie, getAuth } from "@/lib/auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { getLatestOAuthGenderForAccount } from "@/lib/oauth/accounts";
import { clearSessionClaimCookie } from "@/lib/session-claim";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getAuth();
  if (!auth) {
    return NextResponse.json({ authenticated: false });
  }

  let profileUserId: string | null = null;
  let oauthGender: "male" | "female" | null = null;
  if (auth.role === "user") {
    [profileUserId, oauthGender] = await Promise.all([
      getProfileUserIdForAccount(auth.sub),
      getLatestOAuthGenderForAccount(auth.sub),
    ]);
  }

  const needsProfile = auth.role === "user" && !profileUserId;
  return NextResponse.json({
    authenticated: true,
    needsProfile,
    user: { ...auth, profileUserId, oauthGender },
  });
}

export async function DELETE(request: NextRequest) {
  await clearAuthCookie(request);
  await clearSessionClaimCookie(request);
  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
