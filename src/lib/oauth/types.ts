export type OAuthProvider = "vk" | "yandex";

export type OAuthMode = "login" | "register" | "link";

export interface OAuthTransaction {
  provider: OAuthProvider;
  codeVerifier: string;
  redirectUri: string;
  returnTo: string;
  sessionId: string | null;
  acceptedTerms: boolean;
  ageConfirmed: boolean;
  marketingConsent: boolean;
  mode: OAuthMode;
  appFlow: boolean;
  /** When mode=link — attach provider identity to this account. */
  linkAccountId?: string | null;
  /** First-touch UTM captured at OAuth start (null if none). */
  registrationAttribution?: Record<string, string> | null;
}

export interface OAuthPendingRegistration {
  provider: OAuthProvider;
  info: OAuthUserInfo;
  returnTo: string;
  sessionId: string | null;
  appFlow: boolean;
  registrationAttribution?: Record<string, string> | null;
}

export interface OAuthUserInfo {
  providerUserId: string;
  email: string | null;
  name: string;
  emailVerified: boolean;
  gender?: "male" | "female";
}

export interface OAuthFinishResult {
  account: { id: string; email: string; name: string };
  profile: ReturnType<typeof import("@/lib/users").serializeUserProfile> | null;
  sessionLinked: boolean;
  /** True only when no profile row is linked (legacy); stub profiles count as complete. */
  needsProfile: boolean;
  /** True when birth_date is missing — natal/matrix/HD need progressive completion. */
  needsBirthProfile?: boolean;
  isNewUser: boolean;
}

export const OAUTH_PROVIDERS: OAuthProvider[] = ["yandex", "vk"];

export const OAUTH_PROVIDER_LABELS: Record<OAuthProvider, string> = {
  yandex: "Яндекс",
  vk: "ВКонтакте",
};
