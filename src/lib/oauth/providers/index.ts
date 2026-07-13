import type { OAuthProvider, OAuthUserInfo } from "../types";
import { buildVkAuthorizeUrl, exchangeVkCode } from "./vk";
import { buildYandexAuthorizeUrl, exchangeYandexCode } from "./yandex";

export function buildProviderAuthorizeUrl(
  provider: OAuthProvider,
  state: string,
  codeChallenge: string,
  redirectUri: string
): string {
  switch (provider) {
    case "yandex":
      return buildYandexAuthorizeUrl(state, codeChallenge, redirectUri);
    case "vk":
      return buildVkAuthorizeUrl(state, codeChallenge, redirectUri);
    default:
      throw new Error(`Unknown OAuth provider: ${provider satisfies never}`);
  }
}

export async function exchangeProviderCode(
  provider: OAuthProvider,
  code: string,
  codeVerifier: string,
  redirectUri: string,
  options?: { deviceId?: string; state?: string }
): Promise<OAuthUserInfo> {
  switch (provider) {
    case "yandex":
      return exchangeYandexCode(code, codeVerifier, redirectUri);
    case "vk":
      return exchangeVkCode(code, codeVerifier, redirectUri, options);
    default:
      throw new Error(`Unknown OAuth provider: ${provider satisfies never}`);
  }
}
