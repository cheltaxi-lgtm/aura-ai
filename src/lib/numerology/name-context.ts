/** Resolve full name for numerology (profile + message extraction). */

const FIO_HINT =
  /(?:меня\s+зовут|моё\s+имя|мое\s+имя|фио|полное\s+имя|зовут)\s+([а-яёА-ЯЁa-zA-Z\-]+(?:\s+[а-яёА-ЯЁa-zA-Z\-]+){1,3})/i;

const CYRILLIC_NAME_PART = /[а-яёА-ЯЁ-]+/;

function normalizeName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\s-]/gu, "")
    .trim();
}

function wordCount(name: string): number {
  return name.split(/\s+/).filter(Boolean).length;
}

/** Try to pull full FIO from user message. */
export function extractFullNameFromMessage(message: string): string | null {
  if (!message?.trim()) return null;

  const hint = message.match(FIO_HINT);
  if (hint?.[1]) {
    const name = normalizeName(hint[1]);
    if (wordCount(name) >= 2) return name;
  }

  const lines = message.split(/\n|,|;/).map((s) => s.trim());
  for (const line of lines) {
    const cleaned = normalizeName(line);
    const parts = cleaned.split(/\s+/).filter((p) => CYRILLIC_NAME_PART.test(p));
    if (parts.length >= 2 && parts.length <= 4) {
      const joined = parts.join(" ");
      if (joined.length >= 5 && joined.length <= 80) return joined;
    }
  }

  return null;
}

export interface ResolvedNumerologyName {
  /** Name used for destiny/soul/personality calculations. */
  fullName: string;
  /** First token for addressing (profile or message). */
  givenName: string;
  /** Single word only — ask for full FIO before name-based deep dives. */
  needsFullFio: boolean;
  /** FIO taken from this message, not profile. */
  fromMessage: boolean;
}

export function resolveNumerologyName(
  profileName: string | undefined,
  message: string | undefined
): ResolvedNumerologyName {
  const fromMsg = message ? extractFullNameFromMessage(message) : null;
  const profile = normalizeName(profileName ?? "");
  const profileWords = wordCount(profile);

  let fullName = fromMsg ?? profile;
  let fromMessage = Boolean(fromMsg);

  if (fromMsg && profileWords >= 2 && profile.length > fromMsg.length) {
    fullName = profile;
    fromMessage = false;
  }

  const givenName = (fullName.split(/\s+/)[0] || profile.split(/\s+/)[0] || "друг").trim();

  const needsFullFio = wordCount(fullName) < 2;

  return { fullName, givenName, needsFullFio, fromMessage };
}

export function nameTopicsNeedFullFio(topics: readonly string[]): boolean {
  return topics.some((t) => ["karma", "chaldean", "compatibility"].includes(t));
}
