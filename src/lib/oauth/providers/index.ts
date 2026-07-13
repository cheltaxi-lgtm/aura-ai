import type { OAuthProvider, OAuthUserInfo } from "../types";
import { buildMailRuAuthorizeUrl, exchangeMailRuCode } from "./mailru";
import { buildVkAuthorizeUrl, exchangeVkCode } from "./vk";
import { buildYandexAuthorizeUrl, exchangeYandexCode } from "./yandex";

export function buildProviderAuthorizeUrl(
  provider: OAuthProvider,
  state: string,
  codeChallenge: string
): string {
  switch (provider) {
    case "yandex":
      return buildYandexAuthorizeUrl(state, codeChallenge);
    case "vk":
      return buildVkAuthorizeUrl(state, codeChallenge);
    case "mailru":
      return buildMailRuAuthorizeUrl(state, codeChallenge);
    default:
      throw new Error(`Unknown OAuth provider: ${provider satisfies never}`);
  }
}

export async function exchangeProviderCode(
  provider: OAuthProvider,
  code: string,
  codeVerifier: string
): Promise<OAuthUserInfo> {
  switch (provider) {
    case "yandex":
      return exchangeYandexCode(code, codeVerifier);
    case "vk":
      return exchangeVkCode(code, codeVerifier);
    case "mailru":
      return exchangeMailRuCode(code, codeVerifier);
    default:
      throw new Error(`Unknown OAuth provider: ${provider satisfies never}`);
  }
}
