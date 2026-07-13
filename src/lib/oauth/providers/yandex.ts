import { requireOAuthProviderConfig } from "../config";
import type { OAuthUserInfo } from "../types";

interface YandexTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface YandexUserInfo {
  id?: string;
  login?: string;
  default_email?: string;
  emails?: string[];
  real_name?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  sex?: "male" | "female" | null;
}

export function buildYandexAuthorizeUrl(
  state: string,
  codeChallenge: string,
  redirectUri: string
): string {
  const { clientId } = requireOAuthProviderConfig("yandex");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    scope: "login:info login:email",
  });
  return `https://oauth.yandex.ru/authorize?${params.toString()}`;
}

export async function exchangeYandexCode(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<OAuthUserInfo> {
  const { clientId, clientSecret } = requireOAuthProviderConfig("yandex");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const tokenRes = await fetch("https://oauth.yandex.ru/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const tokenData = (await tokenRes.json()) as YandexTokenResponse;
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description ?? tokenData.error ?? "yandex_token_failed");
  }

  const userRes = await fetch("https://login.yandex.ru/info?format=json", {
    headers: { Authorization: `OAuth ${tokenData.access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  const user = (await userRes.json()) as YandexUserInfo;
  if (!userRes.ok || !user.id) {
    throw new Error("yandex_userinfo_failed");
  }

  const email = user.default_email ?? user.emails?.[0] ?? null;
  const name =
    user.real_name?.trim() ||
    user.display_name?.trim() ||
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    user.login?.trim() ||
    "Искатель";

  const gender = user.sex === "male" || user.sex === "female" ? user.sex : undefined;

  return {
    providerUserId: String(user.id),
    email: email?.trim().toLowerCase() ?? null,
    name,
    emailVerified: Boolean(email),
    gender,
  };
}
