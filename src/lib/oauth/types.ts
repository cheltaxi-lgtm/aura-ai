export type OAuthProvider = "vk" | "yandex";

export type OAuthMode = "login" | "register";

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
}

export interface OAuthPendingRegistration {
  provider: OAuthProvider;
  info: OAuthUserInfo;
  returnTo: string;
  sessionId: string | null;
  appFlow: boolean;
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
  needsProfile: boolean;
  isNewUser: boolean;
}

export const OAUTH_PROVIDERS: OAuthProvider[] = ["yandex", "vk"];

export const OAUTH_PROVIDER_LABELS: Record<OAuthProvider, string> = {
  yandex: "Яндекс",
  vk: "ВКонтакте",
};
