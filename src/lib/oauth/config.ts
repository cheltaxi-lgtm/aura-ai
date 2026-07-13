import type { OAuthProvider } from "./types";

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
}

function readProviderConfig(provider: OAuthProvider): OAuthProviderConfig | null {
  const envMap: Record<OAuthProvider, { id: string; secret: string }> = {
    yandex: { id: "YANDEX_OAUTH_CLIENT_ID", secret: "YANDEX_OAUTH_CLIENT_SECRET" },
    vk: { id: "VK_CLIENT_ID", secret: "VK_CLIENT_SECRET" },
    mailru: { id: "MAILRU_CLIENT_ID", secret: "MAILRU_CLIENT_SECRET" },
  };
  const keys = envMap[provider];
  const clientId = process.env[keys.id]?.trim() ?? "";
  const clientSecret = process.env[keys.secret]?.trim() ?? "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function getOAuthRedirectUri(provider: OAuthProvider): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/auth/oauth/${provider}/callback`;
}

export function listEnabledOAuthProviders(): OAuthProvider[] {
  return (["yandex", "vk", "mailru"] as OAuthProvider[]).filter(
    (provider) => readProviderConfig(provider) !== null
  );
}

export function requireOAuthProviderConfig(provider: OAuthProvider): OAuthProviderConfig {
  const config = readProviderConfig(provider);
  if (!config) {
    throw new Error(`OAuth provider not configured: ${provider}`);
  }
  return config;
}

export function isOAuthProviderEnabled(provider: string): provider is OAuthProvider {
  return listEnabledOAuthProviders().includes(provider as OAuthProvider);
}
