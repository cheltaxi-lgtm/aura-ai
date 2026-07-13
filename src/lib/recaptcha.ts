import { getSetting } from "@/lib/settings";
import {
  DEFAULT_RECAPTCHA_SCOPES,
  mergeRecaptchaScopes,
  type RecaptchaScope,
  type RecaptchaScopeSettings,
} from "@/lib/recaptcha-scopes";

const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const DEFAULT_MIN_SCORE = 0.5;

/** Lower threshold for signup flows — VPN/ad-block users often score 0.2–0.4. */
const MIN_SCORE_BY_SCOPE: Partial<Record<RecaptchaScope, number>> = {
  register: 0.3,
  expertRegister: 0.3,
};

function minScoreForScope(scope: RecaptchaScope): number {
  return MIN_SCORE_BY_SCOPE[scope] ?? DEFAULT_MIN_SCORE;
}

const IP_V4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const IP_V6 = /^[0-9a-f:]+$/i;

export function normalizeRecaptchaRemoteIp(raw?: string | null): string | undefined {
  const ip = raw?.trim();
  if (!ip || ip === "unknown") return undefined;
  if (IP_V4.test(ip) || IP_V6.test(ip)) return ip;
  return undefined;
}

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

/**
 * Admin login is the only door into the settings UI that controls reCAPTCHA
 * itself. Never gate it behind a score check: a false-positive "suspicious"
 * score (VPN, ad blocker, corporate proxy, etc.) would permanently lock every
 * admin out with no self-service way back in, since the toggle to disable it
 * lives inside the admin panel. Password + login rate limiting already guard
 * this endpoint, so the security trade-off isn't worth the lockout risk.
 */
const RECAPTCHA_LOCKOUT_EXEMPT_SCOPES: ReadonlySet<RecaptchaScope> = new Set(["adminLogin"]);

export async function verifyRecaptchaForScope(
  token: string | undefined,
  scope: RecaptchaScope,
  remoteIp?: string | null
): Promise<RecaptchaResult> {
  if (RECAPTCHA_LOCKOUT_EXEMPT_SCOPES.has(scope)) {
    return { ok: true };
  }

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

  return verifyRecaptcha(token, remoteIp, minScoreForScope(scope));
}

export async function verifyRecaptcha(
  token: string | undefined,
  remoteIp?: string | null,
  minScore = DEFAULT_MIN_SCORE
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
  const ip = normalizeRecaptchaRemoteIp(remoteIp);
  if (ip) {
    body.set("remoteip", ip);
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
    const codes = data["error-codes"] ?? [];
    console.warn("reCAPTCHA verify failed:", codes, "score:", data.score);
    if (codes.includes("browser-error")) {
      return {
        ok: false,
        error:
          "reCAPTCHA не прошла проверку в этом браузере. Отключите блокировщик рекламы или попробуйте другой браузер.",
      };
    }
    if (codes.includes("invalid-input-secret")) {
      return {
        ok: false,
        error: "Проверка безопасности временно недоступна. Обратитесь в поддержку.",
      };
    }
    if (codes.includes("timeout-or-duplicate")) {
      return {
        ok: false,
        error: "Сессия reCAPTCHA истекла. Обновите страницу и попробуйте снова.",
      };
    }
    return { ok: false, error: "Проверка reCAPTCHA не пройдена" };
  }

  if (data.score !== undefined && data.score < minScore) {
    console.warn("reCAPTCHA low score:", data.score, "min:", minScore);
    return {
      ok: false,
      error:
        "reCAPTCHA оценила запрос как подозрительный. Попробуйте ещё раз или другой браузер.",
    };
  }

  return { ok: true };
}
