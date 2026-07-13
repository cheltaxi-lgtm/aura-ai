import { getRecaptchaToken } from "@/lib/useRecaptcha";
import { shouldUseAppShellClient } from "@/lib/app-shell";
import type { RecaptchaScope } from "@/lib/recaptcha-scopes";
import type { PlatformFeatures } from "@/lib/usePlatformFeatures";

async function fetchRecaptchaToken(scope: RecaptchaScope): Promise<string | null> {
  let token = await getRecaptchaToken(scope);
  if (!token) {
    token = await getRecaptchaToken(scope);
  }
  return token;
}

export async function attachRecaptchaToken(
  body: Record<string, unknown>,
  scope: RecaptchaScope,
  features: PlatformFeatures
): Promise<string | null> {
  if (shouldUseAppShellClient()) return null;
  if (!features.recaptcha.masterEnabled || !features.recaptcha.scopes[scope]) return null;

  const token = await fetchRecaptchaToken(scope);
  if (!token) {
    return "Не удалось пройти проверку reCAPTCHA. Обновите страницу и попробуйте снова.";
  }

  body.recaptchaToken = token;
  return null;
}
