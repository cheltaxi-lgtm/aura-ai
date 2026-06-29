import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyRecaptchaForScope, type RecaptchaScope } from "@/lib/recaptcha";

export async function enforceRecaptchaScope(
  scope: RecaptchaScope,
  token: string | undefined,
  request: NextRequest
): Promise<NextResponse | null> {
  const captcha = await verifyRecaptchaForScope(
    token,
    scope,
    request.headers.get("x-forwarded-for")
  );
  if (!captcha.ok) {
    return NextResponse.json(
      { error: captcha.error, code: "recaptcha_failed" },
      { status: 400 }
    );
  }
  return null;
}
