import { getAuth, type AuthPayload } from "./auth";
import { getProfileUserIdForAccount } from "./accounts";

export async function requireUserAuth(): Promise<AuthPayload | null> {
  const auth = await getAuth();
  if (!auth || auth.role !== "user") return null;
  return auth;
}

/** Resolves onboarding profile id (users.id) for a logged-in account. */
export async function requireProfileUserId(): Promise<{
  auth: AuthPayload;
  profileUserId: string;
} | null> {
  const auth = await requireUserAuth();
  if (!auth) return null;

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) return null;

  return { auth, profileUserId };
}
