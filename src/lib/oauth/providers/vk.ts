import { requireOAuthProviderConfig } from "../config";
import type { OAuthUserInfo } from "../types";

interface VkTokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  user_id?: number;
  error?: string;
  error_description?: string;
  error_msg?: string;
}

interface VkUserInfoResponse {
  user?: {
    user_id?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    sex?: number;
  };
  error?: string;
  error_description?: string;
}

export async function fetchVkUserInfo(
  accessToken: string,
  clientId: string
): Promise<OAuthUserInfo> {
  const userBody = new URLSearchParams({
    client_id: clientId,
    access_token: accessToken,
  });
  const userRes = await fetch("https://id.vk.ru/oauth2/user_info", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: userBody.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const userData = (await userRes.json()) as VkUserInfoResponse;
  const user = userData.user;
  if (!userRes.ok || !user?.user_id) {
    throw new Error(userData.error_description ?? userData.error ?? "vk_userinfo_failed");
  }

  const name =
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    `Пользователь VK ${user.user_id}`;
  const gender = user.sex === 1 ? "female" : user.sex === 2 ? "male" : undefined;

  return {
    providerUserId: String(user.user_id),
    email: user.email?.trim().toLowerCase() ?? null,
    name,
    emailVerified: Boolean(user.email),
    gender,
  };
}

export function buildVkAuthorizeUrl(
  state: string,
  codeChallenge: string,
  redirectUri: string
): string {
  const { clientId } = requireOAuthProviderConfig("vk");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    // Space-separated scopes per VK ID web docs.
    scope: "email",
  });
  return `https://id.vk.ru/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens.
 * VK ID confidential apps require `service_token` (NOT OAuth2 `client_secret`).
 * @see https://id.vk.com/about/business/go/docs/ru/vkid/latest/vk-id/connection/api-description
 */
export async function exchangeVkCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  options?: { deviceId?: string; state?: string }
): Promise<OAuthUserInfo> {
  if (!options?.deviceId?.trim()) {
    throw new Error("vk_device_id_required");
  }
  if (!codeVerifier.trim()) {
    throw new Error("vk_code_verifier_required");
  }
  const { clientId, clientSecret, serviceToken } = requireOAuthProviderConfig("vk");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier.trim(),
    device_id: options.deviceId.trim(),
  });
  if (options?.state) body.set("state", options.state);

  // Prefer dedicated service token; fall back to protected key env for older deploys.
  const vkServiceToken = serviceToken?.trim() || clientSecret?.trim() || "";
  if (vkServiceToken) {
    body.set("service_token", vkServiceToken);
  }

  const tokenRes = await fetch("https://id.vk.ru/oauth2/auth", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const tokenData = (await tokenRes.json()) as VkTokenResponse;
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(
      tokenData.error_description ??
        tokenData.error_msg ??
        tokenData.error ??
        "vk_token_failed"
    );
  }

  return fetchVkUserInfo(tokenData.access_token, clientId);
}
