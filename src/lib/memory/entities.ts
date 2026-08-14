/**
 * Lightweight person/entity keys on top of user_facts.entity_key / subject_key.
 * Same first name is never enough to merge two people.
 */

const RU_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "j",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

const PERSON_NAME_RE = /(?:^|[^\p{L}])([А-ЯЁ][а-яё]{2,20})(?=[^\p{L}]|$)/gu;

const GENERIC_NAME_BLOCK = new Set([
  "января",
  "февраля",
  "марта",
  "апреля",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
  "воскресенье",
]);

/** Strip common Russian given-name case endings so Сергей / Сергеем share a key. */
export function stemRussianGivenName(name: string): string {
  let raw = name.trim().toLowerCase().replace(/ё/g, "е");
  if (!/[а-я]/.test(raw)) return raw;
  // Сергей / Андрей: keep the stem vowel (серге), then strip case endings.
  if (raw.endsWith("й") && raw.length >= 4) {
    raw = raw.slice(0, -1);
  }
  const endings = ["ями", "ами", "ем", "ом", "ой", "ей", "ею", "ию", "ью", "ую", "ю", "я", "у", "и", "а"];
  for (const ending of endings) {
    if (raw.length - ending.length >= 3 && raw.endsWith(ending)) {
      return raw.slice(0, -ending.length);
    }
  }
  return raw;
}

export function slugPersonName(name: string): string {
  return stemRussianGivenName(name)
    .split("")
    .map((ch) => RU_TO_LATIN[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
}

export function personEntityKey(name: string, role?: string | null): string | null {
  const slug = slugPersonName(name);
  if (slug.length < 3) return null;
  const roleSlug = role ? slugPersonName(role) : "";
  return roleSlug ? `person:${slug}:${roleSlug}` : `person:${slug}`;
}

export function personSlugFromEntityKey(entityKey: string | null | undefined): string | null {
  if (!entityKey) return null;
  const m = /^person:([a-z0-9]+)(?::([a-z0-9]+))?$/.exec(entityKey.trim());
  return m?.[1] ?? null;
}

export function entityRoleFromKey(entityKey: string | null | undefined): string | null {
  if (!entityKey) return null;
  const m = /^person:[a-z0-9]+:([a-z0-9]+)$/.exec(entityKey.trim());
  return m?.[1] ?? null;
}

/** Extract capitalized Russian given names from a user question. */
export function extractPersonMentions(text: string): string[] {
  const found = new Set<string>();
  const re = new RegExp(PERSON_NAME_RE.source, PERSON_NAME_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = m[1];
    if (GENERIC_NAME_BLOCK.has(name.toLowerCase())) continue;
    found.add(name);
  }
  return [...found];
}

export function mentionMatchesEntity(
  mention: string,
  entityKey: string | null | undefined
): boolean {
  const mentionSlug = slugPersonName(mention);
  const entitySlug = personSlugFromEntityKey(entityKey);
  return Boolean(mentionSlug && entitySlug && mentionSlug === entitySlug);
}

/**
 * Two rows may merge only when they clearly name the same person.
 * Same first-name slug with different roles must stay separate.
 */
export function entitiesCompatibleForMerge(a: {
  entityKey?: string | null;
  subjectKey?: string | null;
  predicateKey?: string | null;
}, b: {
  entityKey?: string | null;
  subjectKey?: string | null;
  predicateKey?: string | null;
}): boolean {
  const aKey = a.entityKey?.trim() || null;
  const bKey = b.entityKey?.trim() || null;
  if (aKey && bKey && aKey !== bKey) return false;

  const aSlug = personSlugFromEntityKey(aKey);
  const bSlug = personSlugFromEntityKey(bKey);
  if (aSlug && bSlug && aSlug !== bSlug) return false;

  const aRole = entityRoleFromKey(aKey);
  const bRole = entityRoleFromKey(bKey);
  if (aRole && bRole && aRole !== bRole) return false;

  if (aKey && bKey && aKey === bKey) return true;
  if (aKey && !bKey) return false;
  if (!aKey && bKey) return false;
  return true;
}

export function looksLikePersonPredicate(predicateKey: string | null | undefined): boolean {
  if (!predicateKey) return false;
  return /^(relationship|family)\./.test(predicateKey);
}
