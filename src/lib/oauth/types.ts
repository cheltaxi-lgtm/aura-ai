export type OAuthProvider = "vk" | "yandex" | "mailru";

export type OAuthMode = "login" | "register";

export interface OAuthPendingState {
  provider: OAuthProvider;
  codeVerifier: string;
  returnTo: string;
  sessionId?: string;
  acceptedTerms: boolean;
  ageConfirmed: boolean;
  marketingConsent: boolean;
  mode: OAuthMode;
}

export interface OAuthUserInfo {
  providerUserId: string;
  email: string | null;
  name: string;
  emailVerified: boolean;
}

export interface OAuthFinishResult {
  account: { id: string; email: string; name: string };
  profile: ReturnType<typeof import("@/lib/users").serializeUserProfile> | null;
  sessionLinked: boolean;
  needsProfile: boolean;
  isNewUser: boolean;
}

export const OAUTH_PROVIDERS: OAuthProvider[] = ["yandex", "vk", "mailru"];

export const OAUTH_PROVIDER_LABELS: Record<OAuthProvider, string> = {
  yandex: "Яндекс",
  vk: "ВКонтакте",
  mailru: "Mail.ru",
};
