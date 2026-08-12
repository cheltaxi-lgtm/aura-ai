import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookie, getAuth } from "@/lib/auth";
import {
  getAccountCreatedAt,
  getProfileUserIdForAccount,
  hasAccountAgeConfirmed,
} from "@/lib/accounts";
import { getLatestOAuthGenderForAccount } from "@/lib/oauth/accounts";
import { clearSessionClaimCookie } from "@/lib/session-claim";
import { getUserById, profileHasBirthData } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getAuth();
  if (!auth) {
    return NextResponse.json({ authenticated: false });
  }

  let profileUserId: string | null = null;
  let oauthGender: "male" | "female" | null = null;
  let ageConfirmed = true;
  let needsBirthProfile = false;
  /** ISO registration instant from user_accounts — for retention math only. */
  let createdAt: string | null = null;
  if (auth.role === "user") {
    const [profileId, gender, ageOk, accountCreatedAt] = await Promise.all([
      getProfileUserIdForAccount(auth.sub),
      getLatestOAuthGenderForAccount(auth.sub),
      hasAccountAgeConfirmed(auth.sub),
      getAccountCreatedAt(auth.sub),
    ]);
    profileUserId = profileId;
    oauthGender = gender;
    ageConfirmed = ageOk;
    createdAt = accountCreatedAt?.toISOString() ?? null;
    if (profileUserId) {
      const row = await getUserById(profileUserId);
      needsBirthProfile = !profileHasBirthData(row);
    } else {
      needsBirthProfile = true;
    }
  }

  // needsProfile = no linked profile row (legacy). Stub profiles with null birth
  // count as registered — birth is progressive (needsBirthProfile).
  const needsProfile = auth.role === "user" && !profileUserId;
  return NextResponse.json({
    authenticated: true,
    needsProfile,
    needsBirthProfile,
    user: { ...auth, profileUserId, oauthGender, ageConfirmed, createdAt },
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
