const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const MIN_SCORE = 0.3;

export interface RecaptchaResult {
  ok: boolean;
  error?: string;
}

export function isRecaptchaEnabled(): boolean {
  if (
    process.env.RECAPTCHA_ENABLED === "false" ||
    process.env.NEXT_PUBLIC_RECAPTCHA_ENABLED === "false"
  ) {
    return false;
  }
  return Boolean(process.env.RECAPTCHA_SECRET_KEY?.trim());
}

export async function verifyRecaptcha(
  token: string | undefined,
  remoteIp?: string | null
): Promise<RecaptchaResult> {
  if (!isRecaptchaEnabled()) {
    return { ok: true };
  }

  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    console.warn("RECAPTCHA_SECRET_KEY not set, skipping verification");
    return { ok: true };
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
