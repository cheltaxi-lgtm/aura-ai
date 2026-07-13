import type { NextRequest } from "next/server";
import type { OAuthProvider } from "./types";

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  serviceToken?: string;
}

function readProviderConfig(provider: OAuthProvider): OAuthProviderConfig | null {
  const clientId =
    process.env[
      provider === "vk" ? "VK_CLIENT_ID" : "YANDEX_OAUTH_CLIENT_ID"
    ]?.trim() ?? "";
  // VK calls this credential the protected key. VK_CLIENT_SECRET remains a
  // compatibility alias for existing deployments; VK_SERVICE_TOKEN is separate.
  const clientSecret =
    provider === "vk"
      ? process.env.VK_CLIENT_PROTECTED_KEY?.trim() ||
        process.env.VK_CLIENT_SECRET?.trim() ||
        ""
      : process.env.YANDEX_OAUTH_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    serviceToken: provider === "vk" ? process.env.VK_SERVICE_TOKEN?.trim() || undefined : undefined,
  };
}

/** Public site origin for OAuth callbacks (must match provider app settings). */
function isLocalOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export function resolveOAuthOrigin(request?: NextRequest): string {
  const envBase = (process.env.NEXT_PUBLIC_APP_URL ?? "https://zovus.ru").replace(/\/$/, "");
  let origin = envBase;

  if (request) {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host")?.trim();
    if (host) {
      const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
      const proto =
        forwardedProto ||
        (request.nextUrl.protocol === "https:" ? "https" : "http");
      origin = `${proto}://${host}`.replace(/\/$/, "");
    } else {
      origin = request.nextUrl.origin.replace(/\/$/, "");
    }
  }

  if (process.env.NODE_ENV === "production" && isLocalOrigin(origin)) {
    return envBase;
  }
  return origin;
}

/** Build absolute app URLs for OAuth redirects (never use raw request.url behind a proxy). */
export function oauthAbsoluteUrl(request: NextRequest, path: string): URL {
  return new URL(path, `${resolveOAuthOrigin(request)}/`);
}

export function getOAuthRedirectUri(provider: OAuthProvider, origin?: string): string {
  const base = (origin ?? resolveOAuthOrigin()).replace(/\/$/, "");
  return `${base}/api/auth/oauth/${provider}/callback`;
}

export function listEnabledOAuthProviders(): OAuthProvider[] {
  return (["yandex", "vk"] as OAuthProvider[]).filter(
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
