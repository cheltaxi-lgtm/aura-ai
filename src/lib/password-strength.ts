import { MIN_PASSWORD_LENGTH } from "@/lib/auth-policy";

export type PasswordStrength = "weak" | "fair" | "good" | "strong";

export function scorePasswordStrength(password: string): PasswordStrength {
  if (password.length < MIN_PASSWORD_LENGTH) return "weak";

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;

  if (score <= 1) return "fair";
  if (score <= 3) return "good";
  return "strong";
}

export const PASSWORD_STRENGTH_LABELS: Record<PasswordStrength, string> = {
  weak: "Слишком короткий",
  fair: "Слабый",
  good: "Хороший",
  strong: "Надёжный",
};

export const PASSWORD_STRENGTH_COLORS: Record<PasswordStrength, string> = {
  weak: "text-red-400",
  fair: "text-amber-400",
  good: "text-emerald-400",
  strong: "text-aura-gold",
};
