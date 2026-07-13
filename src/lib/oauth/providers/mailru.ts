import { getOAuthRedirectUri, requireOAuthProviderConfig } from "../config";
import type { OAuthUserInfo } from "../types";

interface MailRuTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface MailRuUserInfo {
  email?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  nickname?: string;
  id?: string;
  error?: string;
  error_description?: string;
}

export function buildMailRuAuthorizeUrl(state: string, codeChallenge: string): string {
  const { clientId } = requireOAuthProviderConfig("mailru");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: getOAuthRedirectUri("mailru"),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://oauth.mail.ru/login?${params.toString()}`;
}

export async function exchangeMailRuCode(
  code: string,
  codeVerifier: string
): Promise<OAuthUserInfo> {
  const { clientId, clientSecret } = requireOAuthProviderConfig("mailru");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getOAuthRedirectUri("mailru"),
    code_verifier: codeVerifier,
  });

  const tokenRes = await fetch("https://oauth.mail.ru/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const tokenData = (await tokenRes.json()) as MailRuTokenResponse;
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description ?? tokenData.error ?? "mailru_token_failed");
  }

  const userRes = await fetch(
    `https://oauth.mail.ru/userinfo?access_token=${encodeURIComponent(tokenData.access_token)}`
  );
  const user = (await userRes.json()) as MailRuUserInfo;
  if (!userRes.ok || !user.id) {
    throw new Error(user.error_description ?? user.error ?? "mailru_userinfo_failed");
  }

  const name =
    user.name?.trim() ||
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    user.nickname?.trim() ||
    user.email?.split("@")[0]?.trim() ||
    "Искатель";

  return {
    providerUserId: String(user.id),
    email: user.email?.trim().toLowerCase() ?? null,
    name,
    emailVerified: Boolean(user.email),
  };
}
