import { getSetting } from "@/lib/settings";
import {
  DEFAULT_RECAPTCHA_SCOPES,
  mergeRecaptchaScopes,
  type RecaptchaScope,
  type RecaptchaScopeSettings,
} from "@/lib/recaptcha-scopes";

const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const MIN_SCORE = 0.3;

export interface RecaptchaResult {
  ok: boolean;
  error?: string;
}

export type { RecaptchaScope, RecaptchaScopeSettings };

export function hasRecaptchaCredentials(): boolean {
  if (
    process.env.RECAPTCHA_ENABLED === "false" ||
    process.env.NEXT_PUBLIC_RECAPTCHA_ENABLED === "false"
  ) {
    return false;
  }
  return Boolean(
    process.env.RECAPTCHA_SECRET_KEY?.trim() &&
      process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim()
  );
}

/** @deprecated Use hasRecaptchaCredentials() or isRecaptchaScopeEnabled() */
export function isRecaptchaEnabled(): boolean {
  return hasRecaptchaCredentials();
}

export async function getRecaptchaScopesConfig(): Promise<{
  configured: boolean;
  masterEnabled: boolean;
  scopes: RecaptchaScopeSettings;
}> {
  const features = await getSetting("features");
  const configured = hasRecaptchaCredentials();
  const mergedScopes = mergeRecaptchaScopes(features.recaptchaScopes);
  const masterEnabled = Boolean(features.recaptchaEnabled && configured);

  const scopes = Object.fromEntries(
    (Object.keys(DEFAULT_RECAPTCHA_SCOPES) as RecaptchaScope[]).map((scope) => [
      scope,
      masterEnabled && mergedScopes[scope] !== false,
    ])
  ) as RecaptchaScopeSettings;

  return { configured, masterEnabled, scopes };
}

export async function isRecaptchaScopeEnabled(scope: RecaptchaScope): Promise<boolean> {
  const { scopes } = await getRecaptchaScopesConfig();
  return scopes[scope] === true;
}

export async function verifyRecaptchaForScope(
  token: string | undefined,
  scope: RecaptchaScope,
  remoteIp?: string | null
): Promise<RecaptchaResult> {
  const features = await getSetting("features");
  const mergedScopes = mergeRecaptchaScopes(features.recaptchaScopes);
  const scopeRequested = features.recaptchaEnabled && mergedScopes[scope] !== false;

  if (!scopeRequested) {
    return { ok: true };
  }

  if (!hasRecaptchaCredentials()) {
    if (process.env.NODE_ENV === "production") {
      console.error(`reCAPTCHA scope "${scope}" enabled but keys missing`);
      return {
        ok: false,
        error: "Проверка безопасности временно недоступна. Обратитесь в поддержку.",
      };
    }
    return { ok: true };
  }

  return verifyRecaptcha(token, remoteIp);
}

export async function verifyRecaptcha(
  token: string | undefined,
  remoteIp?: string | null
): Promise<RecaptchaResult> {
  if (!hasRecaptchaCredentials()) {
    if (process.env.NODE_ENV === "production") {
      console.error("reCAPTCHA keys missing in production");
      return {
        ok: false,
        error: "Проверка безопасности временно недоступна. Обратитесь в поддержку.",
      };
    }
    return { ok: true };
  }

  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    return { ok: false, error: "Проверка reCAPTCHA временно недоступна" };
  }

  if (!token) {
    return { ok: false, error: "Пройдите проверку reCAPTCHA" };
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });
  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  const res = await fetch(RECAPTCHA_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = (await res.json()) as {
    success: boolean;
    score?: number;
    "error-codes"?: string[];
  };

  if (!data.success) {
    console.warn("reCAPTCHA verify failed:", data["error-codes"]);
    return { ok: false, error: "Проверка reCAPTCHA не пройдена" };
  }

  if (data.score !== undefined && data.score < MIN_SCORE) {
    console.warn("reCAPTCHA low score:", data.score);
    return { ok: false, error: "Проверка reCAPTCHA не пройдена" };
  }

  return { ok: true };
}
