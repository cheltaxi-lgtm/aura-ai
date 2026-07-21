/** Normalize / infer client gender for Russian address in readings. */

export type BinaryGender = "male" | "female";

/** Profile / OAuth values → male|female. */
export function normalizeUserGender(raw?: string | null): BinaryGender | null {
  const g = (raw ?? "").trim().toLowerCase();
  if (!g) return null;
  if (g === "male" || g === "m" || g.startsWith("муж")) return "male";
  if (g === "female" || g === "f" || g.startsWith("жен")) return "female";
  if (g.includes("муж")) return "male";
  if (g.includes("жен")) return "female";
  return null;
}

/** Male names that end with -а/-я (must not be treated as female). */
const MALE_A_YA_NAMES = new Set([
  "никита",
  "илья",
  "кузьма",
  "фома",
  "савва",
  "данила",
  "данило",
  "добрыня",
  "лука",
  "иуда",
]);

const FEMALE_SOFT_SIGN = new Set(["любовь", "нинель", "юдифь", "эстер", "руфь"]);

/** Unisex diminutives — never guess from ending. */
const UNISEX_FIRST_NAMES = new Set([
  "саша",
  "саня",
  "женя",
  "валя",
  "шура",
  "сима",
  "толя",
  "слава",
  "миша",
]);

/**
 * Heuristic from first name when profile gender is missing.
 * Юлия → female; Юлий → male; Никита → male.
 */
export function inferGenderFromFirstName(name?: string | null): BinaryGender | null {
  const raw = (name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!raw || /^друг$/i.test(raw)) return null;
  const n = raw.toLowerCase().replace(/ё/g, "е");

  if (UNISEX_FIRST_NAMES.has(n)) return null;
  if (MALE_A_YA_NAMES.has(n)) return "male";
  if (FEMALE_SOFT_SIGN.has(n)) return "female";

  // Explicit male -ий / -ей often collide with female -ия if truncated — check full form.
  if (/ий$|ей$|ай$|ой$/i.test(n)) return "male"; // Юлий, Сергей, Николай
  if (/ия$|ья$|ая$/i.test(n)) return "female"; // Юлия, Мария, Наталья
  if (/[ая]$/i.test(n)) return "female";

  if (/ь$/i.test(n)) {
    // Default soft-sign given names in RU are often male (Игорь), except listed females.
    return "male";
  }

  if (/[бвгджзклмнпрстфхцчшщ]$/i.test(n)) return "male";
  return null;
}

export function resolveClientGender(
  profileGender?: string | null,
  firstName?: string | null
): BinaryGender | null {
  return normalizeUserGender(profileGender) ?? inferGenderFromFirstName(firstName);
}

export function genderLabelRu(gender: BinaryGender): string {
  return gender === "female" ? "женщина" : "мужчина";
}

/** Safe API/UI label — never invent female when gender is missing. */
export function genderLabelOrUndefined(
  raw?: string | null
): "Мужской" | "Женский" | undefined {
  const g = normalizeUserGender(raw);
  if (g === "male") return "Мужской";
  if (g === "female") return "Женский";
  return undefined;
}

/** Memory / prompt dump: «мужчина» | «женщина» | omit. */
export function genderPromptValue(raw?: string | null): string | undefined {
  const g = normalizeUserGender(raw);
  return g ? genderLabelRu(g) : undefined;
}

/** Prompt block: grammatical gender + nominative name lock. */
export function buildClientGenderInstruction(input: {
  gender: BinaryGender | null;
  firstName: string;
}): string {
  const name = input.firstName.trim() || "друг";
  const lines = [
    "ПОЛ И ОБРАЩЕНИЕ К КЛИЕНТУ:",
    `Имя в именительном падеже: «${name}». Обращайся только так — не склоняй в «${name}ем», «${name}у» как к другому имени и не меняй на мужскую/женскую пару (Юлия≠Юлий, Александр≠Александра).`,
  ];

  if (input.gender === "female") {
    lines.push(
      "Клиент — ЖЕНЩИНА. Весь текст только в женском роде: пришла, готова, чувствительна, умела, восстанавливалась, «ты — такая». Запрещены мужские формы: пришёл, готов, чувствителен, Юлием, мужчина."
    );
  } else if (input.gender === "male") {
    lines.push(
      "Клиент — МУЖЧИНА. Весь текст только в мужском роде: пришёл, готов, чувствителен, умел, восстанавливался. Запрещены женские формы: пришла, готова, чувствительна."
    );
  } else {
    lines.push(
      "Пол не определён — пиши нейтрально на «ты», избегай согласования вроде «готов/готова»; лучше «ты готов(а)» не использовать — формулируй без рода («ты умеешь», «тебе важно»)."
    );
  }

  return lines.join("\n");
}
