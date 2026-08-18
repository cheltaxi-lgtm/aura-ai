#!/usr/bin/env node
/**
 * Destiny matrix engine + dictionary smoke tests (no DB).
 * Run: npm run verify:destiny-matrix
 */
import {
  ARCANA_DICTIONARY,
  getArcanaEntry,
} from "../src/lib/numerology/arcana-dictionary.ts";
import {
  DESTINY_MATRIX_POINT_KEYS,
  MATRIX_CALCULATION_VERSION,
  destinyMatrix,
  reduceToArcanaNumber,
} from "../src/lib/numerology/destiny-matrix.ts";
import { buildMatrixFreeSummary } from "../src/lib/numerology/matrix-free-summary.ts";
import { buildRichEngineFacts } from "../src/lib/numerology/engine-reply.ts";
import { buildNumerologyChatContext } from "../src/lib/numerology/topic-handlers.ts";
import {
  buildMatrixPlainFinale,
  formatMatrixFinaleKeys,
  formatMatrixPointDictLine,
  formatMatrixRepeatArcanaNote,
  matrixRoleLens,
} from "../src/lib/numerology/matrix-point-prompt.ts";
import {
  breakNumberedSteps,
  formatDestinyMatrixReadingForDisplay,
  looksLikeDestinyMatrixReading,
} from "../src/lib/numerology/format-matrix-reading-display.ts";
import { formatPremiumReadingForDisplay } from "../src/lib/format-premium-reading.ts";
import {
  genderLabelOrUndefined,
  inferGenderFromFirstName,
  normalizeUserGender,
  resolveClientGender,
} from "../src/lib/russian-name-gender.ts";
import { buildGenderPronounBlock } from "../src/lib/prompts/gender-context.ts";
import { buildRitualPrompt } from "../src/lib/ritual-prompt.ts";
import { computeRitualSchedule } from "../src/lib/ritual-timing.ts";

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const FIXTURES = [
  {
    date: "1995-03-14",
    asOfYear: 2026,
    expect: {
      body: 14,
      energy: 3,
      roots: 2,
      purpose: 16,
      relationships: 8,
      money: 18,
      karma: 19,
      talents: 17,
      paternal: 16,
      maternal: 5,
      yearArcana: 5,
    },
    zones: {
      karmicTail: [19, 13, 10],
      age0: 14,
      age40: 2,
      moneyChannel: [19, 16, 18, 13],
      loveChannel: [14, 8, 16, 18],
    },
  },
  {
    date: "2000-01-01",
    asOfYear: 2026,
    expect: {
      body: 1,
      energy: 1,
      roots: 2,
      purpose: 8,
      relationships: 9,
      money: 10,
      karma: 4,
      talents: 2,
      paternal: 3,
      maternal: 3,
      yearArcana: 12,
    },
    zones: {
      karmicTail: [4, 12, 16],
      age0: 1,
      age40: 2,
      moneyChannel: [9, 8, 10, 12],
      loveChannel: [1, 9, 8, 10],
    },
  },
  {
    date: "1988-12-31",
    asOfYear: 2026,
    expect: {
      body: 9,
      energy: 12,
      roots: 4,
      purpose: 6,
      relationships: 15,
      money: 10,
      karma: 3,
      talents: 21,
      paternal: 13,
      maternal: 16,
      yearArcana: 9,
    },
  },
  {
    date: "1975-07-07",
    asOfYear: 2026,
    expect: {
      body: 7,
      energy: 7,
      roots: 22,
      purpose: 6,
      relationships: 13,
      money: 6,
      karma: 14,
      talents: 14,
      paternal: 7,
      maternal: 7,
      yearArcana: 2,
    },
  },
  {
    date: "2010-06-15",
    asOfYear: 2026,
    expect: {
      body: 15,
      energy: 6,
      roots: 3,
      purpose: 4,
      relationships: 19,
      money: 7,
      karma: 2,
      talents: 21,
      paternal: 18,
      maternal: 9,
      yearArcana: 9,
    },
  },
  {
    date: "1964-11-22",
    asOfYear: 2026,
    expect: {
      body: 22,
      energy: 11,
      roots: 20,
      purpose: 18,
      relationships: 18,
      money: 16,
      karma: 9,
      talents: 11,
      paternal: 20,
      maternal: 9,
      yearArcana: 21,
    },
  },
  {
    date: "1999-09-09",
    asOfYear: 2026,
    expect: {
      body: 9,
      energy: 9,
      roots: 6,
      purpose: 4,
      relationships: 13,
      money: 10,
      karma: 2,
      talents: 18,
      paternal: 15,
      maternal: 15,
      yearArcana: 6,
    },
  },
  {
    date: "1980-02-29",
    asOfYear: 2026,
    expect: {
      body: 7,
      energy: 2,
      roots: 18,
      purpose: 10,
      relationships: 17,
      money: 6,
      karma: 5,
      talents: 9,
      paternal: 3,
      maternal: 20,
      yearArcana: 19,
    },
  },
  {
    // Classic public example 15.08.1985 — canonical subtract-22 chain:
    // A=15 B=8 C=1985→23→1 G=15+8+1=24→2 comfort=15+8+1+2=26→4
    date: "1985-08-15",
    asOfYear: 2026,
    expect: {
      body: 15,
      energy: 8,
      roots: 1,
      purpose: 4,
      relationships: 19,
      money: 5,
      karma: 2,
      talents: 1,
      paternal: 16,
      maternal: 9,
      yearArcana: 11,
    },
    // Full-matrix zones (etalon after calibration)
    zones: {
      karmicTail: [2, 6, 8],
      age0: 15,
      age40: 1,
      moneyChannel: [12, 4, 5, 6],
      loveChannel: [15, 19, 4, 5],
    },
  },
];

assert(MATRIX_CALCULATION_VERSION === "matrix-v4", "version must be matrix-v4");
assert(DESTINY_MATRIX_POINT_KEYS.length === 11, "expected 11 core point keys");

for (const [n, expected] of [
  [0, 22],
  [22, 22],
  [23, 5],
  [31, 4],
  [45, 9],
  [99, 18],
]) {
  assert(reduceToArcanaNumber(n) === expected, `reduceToArcanaNumber(${n}) => ${expected}`);
}

assert(ARCANA_DICTIONARY.length === 22, "dictionary must have 22 entries");
for (let id = 1; id <= 22; id++) {
  const entry = getArcanaEntry(id);
  assert(!!entry, `missing dictionary entry ${id}`);
  assert(entry?.title?.length > 0, `entry ${id} needs title`);
  assert(entry?.light?.length > 0 && entry?.shadow?.length > 0, `entry ${id} needs light/shadow`);
  assert(entry?.money?.length > 0 && entry?.love?.length > 0, `entry ${id} needs money/love`);
}

assert(destinyMatrix("") === null, "empty date => null");
assert(destinyMatrix("not-a-date") === null, "invalid date => null");

for (const fixture of FIXTURES) {
  const matrix = destinyMatrix(fixture.date, {
    asOfYear: fixture.asOfYear,
    calculationVersion: "matrix-v3",
  });
  assert(!!matrix, `${fixture.date}: matrix computed`);
  if (!matrix) continue;
  for (const key of DESTINY_MATRIX_POINT_KEYS) {
    const actual = matrix[key]?.number;
    const expected = fixture.expect[key];
    assert(
      actual === expected,
      `${fixture.date}.${key}: expected ${expected}, got ${actual}`
    );
    assert(actual >= 1 && actual <= 22, `${fixture.date}.${key} out of 1–22`);
    assert(matrix[key].arcanaName.length > 0, `${fixture.date}.${key} missing name`);
  }
  assert(matrix.comfort.number === matrix.purpose.number, `${fixture.date}: comfort===purpose`);
  assert(matrix.karmicTail?.length === 3, `${fixture.date}: karmic tail 3`);
  assert(matrix.agePoints?.length === 17, `${fixture.date}: 17 age points (0–80 belt)`);
  assert(
    matrix.agePoints?.at(-1)?.age === 80,
    `${fixture.date}: age belt must close at 80`
  );
  assert(
    matrix.asOf?.year === fixture.asOfYear,
    `${fixture.date}: asOf.year must echo the frozen year`
  );
  assert(matrix.channels?.length === 5, `${fixture.date}: 5 channels`);
  assert(matrix.monthArcana?.number >= 1, `${fixture.date}: month arcana`);
  assert(matrix.focusLabel?.length > 0, `${fixture.date}: focus label`);

  if (fixture.zones) {
    const z = fixture.zones;
    const tail = matrix.karmicTail.map((p) => p.number);
    assert(
      JSON.stringify(tail) === JSON.stringify(z.karmicTail),
      `${fixture.date}: karmicTail expected ${z.karmicTail}, got ${tail}`
    );
    const age0 = matrix.agePoints.find((p) => p.age === 0)?.number;
    const age40 = matrix.agePoints.find((p) => p.age === 40)?.number;
    assert(age0 === z.age0, `${fixture.date}: age0 expected ${z.age0}, got ${age0}`);
    assert(age40 === z.age40, `${fixture.date}: age40 expected ${z.age40}, got ${age40}`);
    const moneyCh = matrix.channels.find((c) => c.id === "money")?.points.map((p) => p.number);
    const loveCh = matrix.channels.find((c) => c.id === "love")?.points.map((p) => p.number);
    assert(
      JSON.stringify(moneyCh) === JSON.stringify(z.moneyChannel),
      `${fixture.date}: moneyChannel expected ${z.moneyChannel}, got ${moneyCh}`
    );
    assert(
      JSON.stringify(loveCh) === JSON.stringify(z.loveChannel),
      `${fixture.date}: loveChannel expected ${z.loveChannel}, got ${loveCh}`
    );
  }

  const summary = buildMatrixFreeSummary(fixture.date, {
    asOfYear: fixture.asOfYear,
    name: "Тест",
  });
  assert(!!summary, `${fixture.date}: free summary`);
  assert(summary?.keyArcana?.length === 3, `${fixture.date}: 3 key arcana`);
  assert(summary?.portrait?.includes("Тест"), `${fixture.date}: portrait uses name`);
  assert(summary?.period?.teaser?.length > 0, `${fixture.date}: period teaser`);
}

// Prompt isolation: full matrix session must not leak Pythagorean LP/soul into engine facts.
{
  const ctx = buildNumerologyChatContext({
    birthDate: "1995-03-14",
    profileName: "Геннадий Тестов",
    lastUserMessage: "Построй мою матрицу судьбы",
  });
  assert(ctx.topics.includes("destiny_matrix"), "matrix topic detected");
  assert(
    !/НУМЕРОЛОГИЧЕСКИЙ БАЗОВЫЙ ПОРТРЕТ/i.test(ctx.prompt),
    "matrix-only context must not include base Pythagorean portrait"
  );
  assert(
    !/ЧИСЛО ЖИЗНЕННОГО ПУТИ \(реальный/i.test(ctx.prompt),
    "matrix-only context must not include life path block"
  );
  assert(/МАТРИЦА СУДЬБЫ/i.test(ctx.prompt), "matrix block present");
  assert(/ЗАПРЕТ СМЕШЕНИЯ/i.test(ctx.prompt), "mix ban present");
  assert(
    !/Имя для обращения: Построй/i.test(ctx.prompt),
    "matrix CTA text must not become client name"
  );

  const facts = buildRichEngineFacts({
    prompt: ctx.prompt,
    primaryTopic: "destiny_matrix",
    userMessage: "Построй мою матрицу судьбы",
  });
  assert(/МАТРИЦА СУДЬБЫ/i.test(facts), "rich facts include matrix");
  assert(
    !/НУМЕРОЛОГИЧЕСКИЙ БАЗОВЫЙ ПОРТРЕТ/i.test(facts),
    "rich facts exclude base portrait"
  );
  assert(!/КВАДРАТ ПИФАГОРА/i.test(facts), "rich facts exclude Pythagoras");
  assert(/нельзя объединять/i.test(facts), "anti-collapse rule in facts");

  // matrix-v3 sample: repeats still possible across roles — prose must stay distinct.
  const gennady = destinyMatrix("1979-09-18", {
    asOfYear: 2026,
    calculationVersion: "matrix-v3",
  });
  assert(!!gennady, "1979-09-18 matrix");
  assert(gennady?.body.number === 18, "1979-09-18 body=18 Moon");
  assert(gennady?.energy.number === 9 && gennady?.karma.number === 9, "energy/karma both 9");
  assert(gennady?.body.number === gennady?.purpose.number, "body/comfort both 18");
  assert(gennady?.roots.number === 4, "1979-09-18 roots=4 Emperor");
  assert(gennady?.talents.number === 5, "1979-09-18 talents=5 Hierophant");
  assert(gennady?.money.number === 22, "1979-09-18 money=22 Fool");
  assert(gennady?.yearArcana.number === 15, "1979-09-18 year=15 Devil");
  assert(gennady?.karmicTail[0].number === 9, "tail root=9");

  const strength = getArcanaEntry(8);
  assert(!!strength, "arcana 8 entry");
  const rootsLens = matrixRoleLens("roots", strength);
  const purposeLens = matrixRoleLens("purpose", strength);
  const loveLens = matrixRoleLens("love", strength);
  const paternalLens = matrixRoleLens("paternal", strength);
  assert(rootsLens !== purposeLens, "role lenses differ roots vs purpose");
  assert(purposeLens !== loveLens, "role lenses differ purpose vs love");
  assert(loveLens !== paternalLens, "role lenses differ love vs paternal");
  assert(!/Совет: Назовите чувство/i.test(rootsLens), "roots lens must not paste generic advice");

  const gCtx = buildNumerologyChatContext({
    birthDate: "1979-09-18",
    profileName: "Геннадий",
    lastUserMessage: "Построй мою матрицу судьбы",
  });
  assert(/ПОВТОРЫ АРКАНОВ/i.test(gCtx.prompt), "repeat-arcana note for Gennady");
  assert(/Угол рода\/корней/i.test(gCtx.prompt), "role lens in prompt");
  assert(
    (gCtx.prompt.match(/Назовите чувство вслух/g) || []).length <= 1,
    "generic Strength advice must not spam every Strength point"
  );

  const lineA = formatMatrixPointDictLine(
    { role: "roots", label: "3. Точка рода", number: 8 },
    strength
  );
  const lineB = formatMatrixPointDictLine(
    { role: "purpose", label: "4. Ось", number: 8 },
    strength
  );
  assert(lineA !== lineB, "formatted point lines differ by role");
  const note = formatMatrixRepeatArcanaNote([
    { role: "roots", label: "3. Род", number: 8 },
    { role: "purpose", label: "4. Центр", number: 8 },
  ]);
  assert(!!note && /8 →/i.test(note), "repeat note lists arcana 8");

  const keys = formatMatrixFinaleKeys(gennady);
  assert(/Аркан года: 15 — Дьявол/i.test(keys), "keys lock year to Devil");
  assert(!/Аркан года: 9/i.test(keys), "keys must not set year to Hermit");

  // «Узел периода» must carry the focus number (periodFromMatrix), not the month arcana.
  {
    const { focusNumber } = await import("../src/lib/numerology/matrix-period.ts");
    const focusN = focusNumber(gennady);
    assert(
      new RegExp(`Узел периода: ${focusN} —`, "i").test(keys),
      `finale keys «Узел периода» must be focus number ${focusN}`
    );
    assert(/Аркан месяца: \d{1,2} —/i.test(keys), "finale keys keep month arcana as its own line");
  }

  // Post-generation arcana fidelity gate (matrix-completeness).
  {
    const { matrixReadingMatchesEngine, isCompleteMatrixReading } = await import(
      "../src/lib/numerology/matrix-completeness.ts"
    );
    const { listMatrixZones } = await import("../src/lib/numerology/matrix-zones.ts");
    const { renderMatrixReadingMarkdown, parseZoneBlock, MATRIX_READING_SCHEMA_VERSION } =
      await import("../src/lib/numerology/matrix-reading-document.ts");
    const zones = listMatrixZones(gennady);
    const goodDoc = renderMatrixReadingMarkdown({
      schemaVersion: MATRIX_READING_SCHEMA_VERSION,
      intro: "Геннадий, вот твоя матрица судьбы по 22 арканам. ".repeat(6),
      zones: zones.map((z) =>
        parseZoneBlock(
          `${z.label}\n${"Текст зоны про ресурс, риск и опору для жизни. ".repeat(8)}\nПрактика: сделай один шаг.`,
          z,
          "engine"
        )
      ),
      finale: "Зона комфорта — опора.\nДеньги — канал.",
      meta: { aiZones: 0, engineZones: zones.length, totalZones: zones.length },
    });
    assert(isCompleteMatrixReading(goodDoc), "engine-rendered doc passes completeness");
    assert(
      matrixReadingMatchesEngine(goodDoc, gennady),
      "engine-rendered doc passes arcana fidelity"
    );
    // Derive the money heading from the engine so the test survives reducer changes.
    const moneyZone = zones.find((z) => z.id === "money");
    const moneyHeading = `Деньги (${moneyZone.number} — ${moneyZone.arcanaName})`;
    assert(goodDoc.includes(moneyHeading), `doc must carry «${moneyHeading}»`);
    const otherNumber = moneyZone.number === 1 ? 2 : 1;
    const swapped = goodDoc.replace(
      moneyHeading,
      `Деньги (${otherNumber} — ${moneyZone.arcanaName})`
    );
    assert(
      swapped !== goodDoc && !matrixReadingMatchesEngine(swapped, gennady),
      "swapped zone number must fail arcana fidelity"
    );
    const wrongName = moneyZone.arcanaName === "Отшельник" ? "Башня" : "Отшельник";
    const renamed = goodDoc.replace(
      moneyHeading,
      `Деньги (${moneyZone.number} — ${wrongName})`
    );
    assert(
      renamed !== goodDoc && !matrixReadingMatchesEngine(renamed, gennady),
      "number with wrong arcana name must fail arcana fidelity"
    );
  }

  const plain = buildMatrixPlainFinale("Геннадий", gennady);
  assert(/Аркан этого года — Дьявол \(15\)/i.test(plain), "plain finale year=15");
  assert(!/аркан этого года — Отшельник/i.test(plain), "plain finale must not call year Hermit");
  assert(/Зона комфорта — Луна \(18\)/i.test(plain), "plain finale comfort=18");
  assert(/Деньги — через Шут/i.test(plain), "plain finale money=Fool");
  assert(plain.includes("\n"), "plain finale uses line breaks");

  const wall = [
    "Геннадий, вот твой разбор матрицы судьбы по 22 арканам. Характер (18 — Луна)",
    "Ты чувствителен к настроениям. Практика: записывай сны. Зона комфорта (18 — Луна)",
    "Ты восстанавливаешься в движении. Кармический хвост · корень (9 — Отшельник)",
    "Узел периода требует внимания.",
    "Шаги на 30 дней:",
    "1) Записывай сны 7 дней. 2) День уединения раз в неделю. 3) Честный разговор.",
    "Простыми словами:",
    plain.replace(/\n/g, " "),
  ].join(" ");
  assert(looksLikeDestinyMatrixReading(wall), "detect matrix wall-of-text");
  const pretty = formatDestinyMatrixReadingForDisplay(wall);
  assert(/^### Характер/m.test(pretty), "matrix point becomes h3");
  assert(/^## Шаги на 30 дней/m.test(pretty), "steps section becomes h2");
  assert(/^## Простыми словами/m.test(pretty), "finale section becomes h2");

  // Structured document path: headings authored from zone objects.
  {
    const {
      renderMatrixReadingMarkdown,
      parseZoneBlock,
      MATRIX_READING_SCHEMA_VERSION,
    } = await import("../src/lib/numerology/matrix-reading-document.ts");
    const { listMatrixZones } = await import("../src/lib/numerology/matrix-zones.ts");
    const zones = listMatrixZones(gennady);
    const structuredMd = renderMatrixReadingMarkdown({
      schemaVersion: MATRIX_READING_SCHEMA_VERSION,
      intro: "Геннадий, вот твоя матрица судьбы по 22 арканам.",
      zones: zones.map((z) =>
        parseZoneBlock(
          `${z.label}\n${"Текст зоны про ресурс, риск и опору для жизни. ".repeat(5)}\nПрактика: сделай один шаг.`,
          z,
          "engine"
        )
      ),
      finale: "Зона комфорта — опора.\nДеньги — канал.",
      meta: { aiZones: 0, engineZones: zones.length, totalZones: zones.length },
    });
    assert(/^### /m.test(structuredMd), "structured doc emits ### zone headings");
    const display = formatDestinyMatrixReadingForDisplay(
      `${structuredMd}\n\nРиск — мечтами, а отношения или дела — неудовлетворёнными.`
    );
    assert(
      !/^###\s*Отношения\s*$/m.test(display),
      "structured markdown path must not invent bare Отношения heading"
    );
  }
  assert(/^1\.\s/m.test(pretty) && /^2\.\s/m.test(pretty) && /^3\.\s/m.test(pretty), "numbered steps on own lines");
  assert(
    breakNumberedSteps("Сделай так. 1) Первый шаг 2) Второй шаг").includes("\n1. "),
    "breakNumberedSteps splits glued 1) 2)"
  );

  // Regression: mid-sentence «отношения» must not become a gold heading.
  const midSentence = formatDestinyMatrixReadingForDisplay(
    [
      "Матрица судьбы — полный разбор.",
      "Точка возраста сейчас (6 — Влюблённые, 45 лет)",
      "Риск — застрять в полумерах, где желания остаются мечтами, а отношения или дела — неудовлетворёнными.",
      "Практика: сделай один шаг.",
      "Ближайший возрастной переход (16 — Башня)",
      "Геннадий, сейчас ты на пороге важного перехода.",
    ].join("\n\n")
  );
  assert(
    !/^###\s*Отношения\s*$/m.test(midSentence) && !/^##\s*Отношения\s*$/m.test(midSentence),
    "must not promote mid-sentence «отношения» to a heading"
  );
  assert(
    /мечтами,\s*а отношения или дела/i.test(midSentence),
    "mid-sentence «а отношения или дела» stays intact"
  );

  const tarotWall =
    "Карты говорят о выборе. **Маг** открывает путь. Простыми словами: действуй мягко. 1) Сделай шаг 2) Не торопись";
  const tarotPretty = formatPremiumReadingForDisplay(tarotWall);
  assert(/^## Простыми словами/m.test(tarotPretty), "general formatter promotes Простыми словами");
  assert(/^1\.\s/m.test(tarotPretty) && /^2\.\s/m.test(tarotPretty), "general formatter splits numbered steps");

  // Must not treat «Деньги» as daily header «День».
  const moneyLine = formatPremiumReadingForDisplay(
    "Ввод. Деньги идут через партнёрство. Простыми словами: держи фокус."
  );
  assert(!/^### День\b/m.test(moneyLine), "must not split Деньги into ### День");
  assert(/^## Простыми словами/m.test(moneyLine), "still promotes Простыми словами after Деньги");

  // Already-markdown tarot should keep a single ## Простыми словами.
  const mdTarot = formatPremiumReadingForDisplay(
    "Ввод.\n\n**Маг** — путь.\n\n## Простыми словами\n\nДействуй мягко."
  );
  assert(
    (mdTarot.match(/^## Простыми словами/gm) || []).length === 1,
    "must not double-promote existing ## Простыми словами"
  );

  assert(normalizeUserGender("female") === "female", "normalize female");
  assert(normalizeUserGender("male") === "male", "normalize male");
  assert(normalizeUserGender("Женский") === "female", "normalize Женский");
  assert(inferGenderFromFirstName("Юлия") === "female", "Юлия → female");
  assert(inferGenderFromFirstName("Юлий") === "male", "Юлий → male");
  assert(inferGenderFromFirstName("Никита") === "male", "Никита → male");
  assert(inferGenderFromFirstName("Саша") === null, "Саша unisex → null");
  assert(inferGenderFromFirstName("Женя") === null, "Женя unisex → null");
  assert(resolveClientGender(null, "Юлия") === "female", "resolve Юлия without profile");
  assert(resolveClientGender("male", "Юлия") === "male", "profile gender wins over name");
  assert(genderLabelOrUndefined(null) === undefined, "label: missing → undefined (not female)");
  assert(genderLabelOrUndefined("male") === "Мужской", "label: male");
  assert(genderLabelOrUndefined("female") === "Женский", "label: female");

  const genderBlock = buildGenderPronounBlock({
    name: "Юлия",
    gender: "female",
    zodiac: "",
    birthDate: "",
    cards: [],
  });
  assert(/ЖЕНЩИНА/i.test(genderBlock), "gender pronoun block marks woman");
  assert(/Юлия≠Юлий|именительном/i.test(genderBlock), "gender block locks nominative name");

  const juliaCtx = buildNumerologyChatContext({
    birthDate: "1990-05-01",
    profileName: "Юлия",
    gender: "female",
    lastUserMessage: "Построй мою матрицу судьбы",
  });
  assert(/женщина/i.test(juliaCtx.prompt), "matrix context includes female gender");
  assert(/Юлия/i.test(juliaCtx.prompt), "matrix context keeps Юлия");
  assert(!/пол клиента не указан/i.test(juliaCtx.prompt), "matrix context must not drop gender");

  const ritualPrompt = buildRitualPrompt({
    characterKey: "agafya",
    ritualType: "love",
    userName: "Юлия",
    userZodiac: "Весы",
    userGender: "female",
    answers: ["ответ"],
    cards: [{ name: "Шут", position: "1", meaning: "начало" }],
    moonPhase: "растущая",
    moonSign: "Овен",
    schedule: computeRitualSchedule("love", new Date("2026-07-20T12:00:00Z")),
  });
  assert(/ЖЕНЩИНА/i.test(ritualPrompt), "ritual prompt includes female gender lock");
  assert(/Юлия/i.test(ritualPrompt), "ritual prompt keeps name");
}

if (failures.length) {
  console.error("verify-destiny-matrix FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log(`verify-destiny-matrix OK (${FIXTURES.length} fixtures, dictionary 22, isolation)`);
