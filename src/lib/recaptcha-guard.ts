import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isAppShellRequest } from "@/lib/app-shell-request";
import { clientIp } from "@/lib/api-guards";
import { verifyRecaptchaForScope, type RecaptchaScope } from "@/lib/recaptcha";

/** Scopes skipped in the native app — WebView gets low reCAPTCHA v3 scores; rate limits still apply. */
const APP_SHELL_RECAPTCHA_EXEMPT: ReadonlySet<RecaptchaScope> = new Set([
  "register",
  "login",
  "expertRegister",
  "expertLogin",
  "support",
  "chat",
  "payments",
  "share",
]);

export async function enforceRecaptchaScope(
  scope: RecaptchaScope,
  token: string | undefined,
  request: NextRequest
): Promise<NextResponse | null> {
  if (APP_SHELL_RECAPTCHA_EXEMPT.has(scope) && isAppShellRequest(request)) {
    return null;
  }

  const captcha = await verifyRecaptchaForScope(token, scope, clientIp(request));
  if (!captcha.ok) {
    return NextResponse.json(
      { error: captcha.error, code: "recaptcha_failed" },
      { status: 400 }
    );
  }
  return null;
}
