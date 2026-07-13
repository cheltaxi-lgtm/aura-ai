"use client";

let scriptPromise: Promise<void> | null = null;

export function preloadRecaptchaScript(): void {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (!siteKey || typeof window === "undefined") return;
  void loadRecaptchaScript(siteKey).catch(() => {});
}

function loadRecaptchaScript(siteKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("no window"));
  }

  if (window.grecaptcha) {
    return Promise.resolve();
  }

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("recaptcha script load failed"));
      document.head.appendChild(script);
    });
  }

  return scriptPromise;
}

export function isRecaptchaConfigured(): boolean {
  if (process.env.NEXT_PUBLIC_RECAPTCHA_ENABLED === "false") {
    return false;
  }
  return Boolean(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY);
}

export async function getRecaptchaToken(action = "signup"): Promise<string | null> {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (!siteKey) {
    return null;
  }

  await loadRecaptchaScript(siteKey);

  return new Promise((resolve) => {
    window.grecaptcha.ready(async () => {
      try {
        const token = await window.grecaptcha.execute(siteKey, { action });
        resolve(token);
      } catch {
        resolve(null);
      }
    });
  });
}
