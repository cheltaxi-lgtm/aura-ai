import { getOAuthRedirectUri, requireOAuthProviderConfig } from "../config";
import type { OAuthUserInfo } from "../types";

interface VkTokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  user_id?: number;
  error?: string;
  error_description?: string;
}

interface VkUserInfoResponse {
  user?: {
    user_id?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };
  error?: string;
  error_description?: string;
}

export function buildVkAuthorizeUrl(state: string, codeChallenge: string): string {
  const { clientId } = requireOAuthProviderConfig("vk");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: getOAuthRedirectUri("vk"),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    scope: "email",
  });
  return `https://id.vk.ru/authorize?${params.toString()}`;
}

export async function exchangeVkCode(code: string, codeVerifier: string): Promise<OAuthUserInfo> {
  const { clientId, clientSecret } = requireOAuthProviderConfig("vk");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getOAuthRedirectUri("vk"),
    code_verifier: codeVerifier,
  });

  const tokenRes = await fetch("https://id.vk.ru/oauth2/auth", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const tokenData = (await tokenRes.json()) as VkTokenResponse;
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description ?? tokenData.error ?? "vk_token_failed");
  }

  const userBody = new URLSearchParams({
    client_id: clientId,
    access_token: tokenData.access_token,
  });
  const userRes = await fetch("https://id.vk.ru/oauth2/user_info", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: userBody.toString(),
  });
  const userData = (await userRes.json()) as VkUserInfoResponse;
  const user = userData.user;
  if (!userRes.ok || !user?.user_id) {
    throw new Error(userData.error_description ?? userData.error ?? "vk_userinfo_failed");
  }

  const name =
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    `Пользователь VK ${user.user_id}`;

  return {
    providerUserId: String(user.user_id),
    email: user.email?.trim().toLowerCase() ?? null,
    name,
    emailVerified: Boolean(user.email),
  };
}
