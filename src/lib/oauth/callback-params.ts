import type { OAuthProvider } from "./types";

export interface OAuthCallbackParams {
  code: string | null;
  state: string | null;
  deviceId: string | null;
  error: string | null;
}

/** VK ID returns auth data in a JSON `payload` query param (code_v2 flow). */
function parseVkPayload(url: URL): OAuthCallbackParams | null {
  const payloadRaw = url.searchParams.get("payload");
  if (!payloadRaw) return null;
  try {
    const payload = JSON.parse(payloadRaw) as {
      code?: string;
      state?: string;
      device_id?: string;
    };
    return {
      code: payload.code?.trim() || null,
      state: payload.state?.trim() || null,
      deviceId: payload.device_id?.trim() || null,
      error: url.searchParams.get("error"),
    };
  } catch {
    return null;
  }
}

export function parseOAuthCallbackParams(
  provider: OAuthProvider,
  url: URL
): OAuthCallbackParams {
  if (provider === "vk") {
    const fromPayload = parseVkPayload(url);
    if (fromPayload) return fromPayload;
  }

  return {
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
    deviceId: url.searchParams.get("device_id"),
    error: url.searchParams.get("error"),
  };
}
