import { getRecaptchaToken } from "@/lib/useRecaptcha";
import type { RecaptchaScope } from "@/lib/recaptcha-scopes";
import type { PlatformFeatures } from "@/lib/usePlatformFeatures";

export async function attachRecaptchaToken(
  body: Record<string, unknown>,
  scope: RecaptchaScope,
  features: PlatformFeatures
): Promise<string | null> {
  if (!features.recaptcha.scopes[scope]) return null;

  const token = await getRecaptchaToken(scope);
  if (!token) {
    return "Не удалось пройти проверку reCAPTCHA. Обновите страницу и попробуйте снова.";
  }

  body.recaptchaToken = token;
  return null;
}
