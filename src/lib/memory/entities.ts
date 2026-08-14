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
  "стоит",
  "если",
  "когда",
  "почему",
  "какой",
  "какая",
  "какие",
  "какое",
  "этот",
  "эта",
  "это",
  "что",
  "как",
  "где",
  "кто",
  "чем",
  "чей",
  "чья",
  "зачем",
  "откуда",
]);

/** Strip common Russian given-name case endings so Сергей / Сергеем share a key. */
export function stemRussianGivenName(name: string): string {
  const original = name.trim().toLowerCase();
  let raw = original.replace(/ё/g, "е");
  if (!/[а-я]/.test(raw)) return raw;
  // Feminine -а names: Ольга / Нина → Ольгой / Ниной. Must run before stripping
  // a trailing й, otherwise Ольгой becomes ольго and misses person:olg.
  if (raw.length >= 5 && (raw.endsWith("ой") || raw.endsWith("ою"))) {
    return raw.slice(0, -2);
  }
  // Feminine -я names: Мария → Марией, Дарья → Дарьей.
  if (raw.length >= 5 && (raw.endsWith("ией") || raw.endsWith("ьей"))) {
    return raw.slice(0, -2);
  }
  const yotStem = raw.endsWith("й") && raw.length >= 4;
  // Сергей / Андрей: keep the stem vowel (серге), then strip case endings.
  if (yotStem) {
    raw = raw.slice(0, -1);
  }
  // Артём: nominative already ends with -ем after ё→е — do not treat it as instrumental.
  const yoMNominative = original.endsWith("ём");
  // Do not treat «ею» as one ending: Сергею / Андрею must keep the -е- stem.
  const endings = ["ями", "ами", "ем", "ом", "ию", "ью", "ую", "ю", "я", "ы", "у", "и", "а"];
  for (const ending of endings) {
    if (ending === "ем" && yoMNominative && !yotStem) continue;
    if (raw.length - ending.length >= 3 && raw.endsWith(ending)) {
      return raw.slice(0, -ending.length);
    }
  }
  return raw;
}

export function slugPersonName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) =>
      stemRussianGivenName(part)
        .split("")
        .map((ch) => RU_TO_LATIN[ch] ?? ch)
        .join("")
    )
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

const PERSON_CONTEXT_RE =
  /бывш|муж|жен|коллег|врач|терапевт|доктор|сын|доч|мам[аыуе]|пап[аыуе]|отец|друг|партн|родител|брат|сестр|бабуш|дедуш|внук|развод|встреч|между\s+мной|сейчас\s+с/i;

const PLACE_PREP_RE = /(?:^|[^\p{L}])(в|во|из|под|около|близ)\s+$/iu;

export function looksLikePlaceMention(text: string, matchIndex: number): boolean {
  const before = text.slice(Math.max(0, matchIndex - 16), matchIndex);
  return PLACE_PREP_RE.test(before);
}

export function hasPersonContext(text: string, name: string): boolean {
  const idx = text.indexOf(name);
  if (idx < 0) return PERSON_CONTEXT_RE.test(text);
  const window = text.slice(Math.max(0, idx - 28), idx + name.length + 8);
  return PERSON_CONTEXT_RE.test(window);
}

function knownSlugSet(knownEntityKeys: string[]): Set<string> {
  return new Set(
    knownEntityKeys
      .map((key) => personSlugFromEntityKey(key))
      .filter((slug): slug is string => Boolean(slug))
  );
}

/** Extract capitalized Russian given names that look like people, not places/orgs. */
export function extractPersonMentions(
  text: string,
  knownEntityKeys: string[] = []
): string[] {
  const found = new Set<string>();
  const knownSlugs = knownSlugSet(knownEntityKeys);
  const re = new RegExp(PERSON_NAME_RE.source, PERSON_NAME_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = m[1];
    if (GENERIC_NAME_BLOCK.has(name.toLowerCase())) continue;
    const slug = slugPersonName(name);
    const knownHit =
      knownSlugs.has(slug) ||
      [...knownSlugs].some((known) => known.startsWith(slug) && slug.length >= 4);
    const start = m.index + m[0].indexOf(name);
    if (looksLikePlaceMention(text, start) && !knownHit) continue;
    const prev = [...found].at(-1);
    const followsName =
      Boolean(prev) &&
      new RegExp(`${prev}\\s+${name}`).test(text);
    if (!knownHit && !hasPersonContext(text, name) && !followsName) continue;
    found.add(name);
  }
  return [...found];
}

const ROLE_HINTS: Array<{ re: RegExp; roles: string[] }> = [
  { re: /бывш|развод|бывш(ий|ая|его|ему)\s+(муж|жен)/i, roles: ["formerspouse", "formerpartner"] },
  { re: /коллег/i, roles: ["kolleg", "colleague"] },
  { re: /врач|терапевт|доктор/i, roles: ["vrach", "doctor"] },
];

export function detectPersonRoleHints(query: string): string[] {
  const roles = new Set<string>();
  for (const hint of ROLE_HINTS) {
    if (hint.re.test(query)) hint.roles.forEach((role) => roles.add(role));
  }
  return [...roles];
}

export function entityKeyMatchesMentions(
  entityKey: string,
  mentions: string[]
): boolean {
  const slug = personSlugFromEntityKey(entityKey);
  if (!slug) return false;
  const mentionSlugs = mentions.map((name) => slugPersonName(name)).filter(Boolean);
  if (mentionSlugs.some((item) => item === slug)) return true;
  if (mentionSlugs.length >= 2) {
    for (const first of mentionSlugs) {
      for (const last of mentionSlugs) {
        if (first !== last && slug.startsWith(first) && slug.endsWith(last)) return true;
      }
    }
  }
  return false;
}

export function entityKeyMatchesRoleHints(entityKey: string, roleHints: string[]): boolean {
  if (!roleHints.length) return true;
  const role = entityRoleFromKey(entityKey);
  if (!role) return false;
  return roleHints.includes(role);
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
