import {
  buildNumerologyResult,
  EMPTY_NUMEROLOGY_RESULT,
  isVowel,
  KARMIC_DEBT_NUMBERS,
  letterValue,
  parseBirthDate,
  reduceToSingle,
  sumDigits,
  type NumerologyResult,
  type NumerologySystem,
} from "./constants";

export type { NumerologyResult, NumerologySystem };
export {
  reduceToSingle,
  buildNumerologyResult,
  parseBirthDate,
  PYTHAGOREAN_CYRILLIC,
  PYTHAGOREAN_LATIN,
  CHALDEAN_CYRILLIC,
  CHALDEAN_LATIN,
} from "./constants";

function sumFromRaw(raw: number, keepMaster = true): NumerologyResult {
  if (raw <= 0) return { ...EMPTY_NUMEROLOGY_RESULT };
  const reduced = reduceToSingle(raw, keepMaster);
  return buildNumerologyResult(reduced);
}

function sumNameLetters(
  fullName: string,
  system: NumerologySystem,
  filter?: "vowel" | "consonant"
): number {
  if (!fullName?.trim()) return 0;
  let total = 0;
  for (const ch of fullName) {
    if (!/[a-zA-Zа-яА-ЯёЁ]/.test(ch)) continue;
    const vowel = isVowel(ch, system);
    if (filter === "vowel" && !vowel) continue;
    if (filter === "consonant" && vowel) continue;
    total += letterValue(ch, system);
  }
  return total;
}

function detectKarmicDebtsFromReduction(raw: number): number[] {
  const debts = new Set<number>();
  let current = Math.abs(raw);
  const seen = new Set<number>();
  while (current > 9 && !seen.has(current)) {
    seen.add(current);
    if ((KARMIC_DEBT_NUMBERS as readonly number[]).includes(current)) {
      debts.add(current);
    }
    current = sumDigits(current);
  }
  return [...debts];
}

export function lifePathNumber(birthDate: string): NumerologyResult {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return { ...EMPTY_NUMEROLOGY_RESULT };

  const digits = `${parsed.day}${parsed.month}${parsed.year}`.replace(/\D/g, "");
  const raw = [...digits].reduce((s, d) => s + parseInt(d, 10), 0);
  return sumFromRaw(raw, true);
}

export function destinyNumber(
  fullName: string,
  system: NumerologySystem = "pythagorean"
): NumerologyResult {
  const raw = sumNameLetters(fullName, system);
  if (raw <= 0) return { ...EMPTY_NUMEROLOGY_RESULT };
  return sumFromRaw(raw, true);
}

export function soulNumber(
  fullName: string,
  system: NumerologySystem = "pythagorean"
): NumerologyResult {
  const raw = sumNameLetters(fullName, system, "vowel");
  if (raw <= 0) return { ...EMPTY_NUMEROLOGY_RESULT };
  return sumFromRaw(raw, true);
}

export function personalityNumber(
  fullName: string,
  system: NumerologySystem = "pythagorean"
): NumerologyResult {
  const raw = sumNameLetters(fullName, system, "consonant");
  if (raw <= 0) return { ...EMPTY_NUMEROLOGY_RESULT };
  return sumFromRaw(raw, true);
}

export function birthdayNumber(birthDate: string): NumerologyResult {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return { ...EMPTY_NUMEROLOGY_RESULT };
  return sumFromRaw(parsed.day, true);
}

export function maturityNumber(
  lifePath: NumerologyResult,
  destiny: NumerologyResult
): NumerologyResult {
  if (lifePath.number <= 0 || destiny.number <= 0) return { ...EMPTY_NUMEROLOGY_RESULT };
  return sumFromRaw(lifePath.number + destiny.number, true);
}

export function personalYear(
  birthDate: string,
  year?: number
): NumerologyResult {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return { ...EMPTY_NUMEROLOGY_RESULT };

  const y = year ?? new Date().getFullYear();
  const raw = parsed.day + parsed.month + y;
  return sumFromRaw(raw, true);
}

export function personalMonth(
  birthDate: string,
  date?: Date
): NumerologyResult {
  const ref = date ?? new Date();
  const py = personalYear(birthDate, ref.getFullYear());
  if (py.number <= 0) return { ...EMPTY_NUMEROLOGY_RESULT };
  return sumFromRaw(py.number + ref.getMonth() + 1, true);
}

export function personalDay(
  birthDate: string,
  date?: Date
): NumerologyResult {
  const ref = date ?? new Date();
  const pm = personalMonth(birthDate, ref);
  if (pm.number <= 0) return { ...EMPTY_NUMEROLOGY_RESULT };
  return sumFromRaw(pm.number + ref.getDate(), true);
}

export function karmicDebts(birthDate: string, fullName: string): number[] {
  const debts = new Set<number>();
  const parsed = parseBirthDate(birthDate);
  if (parsed) {
    const digits = `${parsed.day}${parsed.month}${parsed.year}`.replace(/\D/g, "");
    const raw = [...digits].reduce((s, d) => s + parseInt(d, 10), 0);
    detectKarmicDebtsFromReduction(raw).forEach((d) => debts.add(d));
  }
  const nameRaw = sumNameLetters(fullName, "pythagorean");
  if (nameRaw > 0) {
    detectKarmicDebtsFromReduction(nameRaw).forEach((d) => debts.add(d));
  }
  return [...debts].sort((a, b) => a - b);
}

export function karmicLessons(fullName: string, system: NumerologySystem = "pythagorean"): number[] {
  if (!fullName?.trim()) return [];
  const present = new Set<number>();
  for (const ch of fullName) {
    if (!/[a-zA-Zа-яА-ЯёЁ]/.test(ch)) continue;
    const v = letterValue(ch, system);
    if (v >= 1 && v <= 9) present.add(v);
  }
  const missing: number[] = [];
  for (let i = 1; i <= 9; i++) {
    if (!present.has(i)) missing.push(i);
  }
  return missing;
}

export function numberOfString(
  value: string,
  system: NumerologySystem = "pythagorean"
): NumerologyResult {
  if (!value?.trim()) return { ...EMPTY_NUMEROLOGY_RESULT };

  const digitsOnly = value.replace(/\D/g, "");
  if (digitsOnly.length >= 3) {
    const raw = [...digitsOnly].reduce((s, d) => s + parseInt(d, 10), 0);
    return sumFromRaw(raw, true);
  }

  const letterSum = sumNameLetters(value, system);
  if (letterSum <= 0) return { ...EMPTY_NUMEROLOGY_RESULT };
  return sumFromRaw(letterSum, true);
}
