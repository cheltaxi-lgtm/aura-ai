import type { FullNumerologyProfile } from "./profile";
import { fullProfile } from "./profile";
import type { PythagorasSquareResult } from "./pythagoras-square";
import { personalYearForecast, personalYearTheme } from "./forecast";
import { personalYear, personalMonth, personalDay, karmicDebts, karmicLessons } from "./calculator";
import { parseBirthDate } from "./constants";

function cellLabel(n: number, count: number): string {
  if (count === 0) return "пусто";
  return String(n).repeat(count);
}

function emptyCells(square: PythagorasSquareResult): number[] {
  return ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).filter((n) => square.cells[n] === 0);
}

function dominantCells(square: PythagorasSquareResult): number[] {
  return ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).filter((n) => square.cells[n] >= 2);
}

const KARMIC_DEBT_HINTS: Record<number, string> = {
  13: "урок терпения, системного труда и ответственности за результат",
  14: "урок свободы без злоупотреблений и хаоса",
  16: "урок смирения, пересборки эго и честности с собой",
  19: "урок самостоятельности без отвержения близких",
};

const LESSON_HINTS: Record<number, string> = {
  1: "инициатива и границы",
  2: "диалог и чувствительность",
  3: "радость и самовыражение",
  4: "структура и дисциплина",
  5: "гибкость и опыт",
  6: "забота и баланс",
  7: "глубина и доверие процессу",
  8: "ответственность и ресурс",
  9: "завершение и мудрость",
};

export function formatMatrixLineEntry(line: { label: string; summary: string }): string {
  let summary = line.summary;
  if (summary.startsWith(line.label)) {
    summary = summary.slice(line.label.length).replace(/^:\s*/, "");
  }
  return `**${line.label}:** ${summary}`;
}

const CELL_NAMES: Record<number, string> = {
  1: "воля и характер",
  2: "энергия",
  3: "здоровье",
  4: "логика",
  5: "труд",
  6: "удача",
  7: "долг",
  8: "талант",
  9: "память и мудрость",
};

function buildSpreadBridge(
  spreadNumbers: string[] | undefined,
  profile: FullNumerologyProfile | null
): string {
  if (!spreadNumbers?.length || spreadNumbers.length < 3) return "";

  const [a, b, c] = spreadNumbers.slice(0, 3);
  const lp = profile?.lifePath.number;
  const py = profile?.personalYear.number;

  const lines = [
    "## Три числа расклада и матрица",
    "",
    `Сейчас в раскладе выпали **${a} · ${b} · ${c}**. Это не «другая судьба» — это **акцент периода** на фоне квадрата.`,
    "",
    `**${a}** — линия старта: ${lp ? `рядом с твоим числом пути ${lp}` : "отражает, с какой силы ты входишь в тему"}.`,
    `**${b}** — энергия момента${py ? `; перекликается с личным годом ${py}` : ""}.`,
    `**${c}** — практический вектор: что числа советуют сделать, не меняя базовую матрицу.`,
  ];

  return lines.join("\n");
}

function buildProfileIntro(name: string, profile: FullNumerologyProfile | null): string {
  if (!profile?.hasValidBirthDate || profile.lifePath.number <= 0) {
    return `${name}, разбираю **квадрат Пифагора** — классическую психоматрицу по дате рождения. Ниже только расчёт движка, без догадок.`;
  }

  const lp = profile.lifePath;
  const masterNote = lp.isMaster ? " (мастер-число)" : "";
  const py = profile.personalYear;

  return [
    `${name}, собрала твой **полный нумерологический портрет** — квадрат Пифагора плюс циклы.`,
    "",
    `**Число жизненного пути:** ${lp.number}${masterNote} — ${lp.title}. ${lp.meaning.split(".").slice(0, 2).join(".")}.`,
    py.number > 0
      ? `**Личный год ${new Date().getFullYear()}:** ${py.number} — ${py.title}. ${py.meaning.split(".")[0]?.trim()}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const INTERP_BY_DIGIT: Record<
  1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
  keyof PythagorasSquareResult["interpretation"]
> = {
  1: "character",
  2: "energy",
  3: "health",
  4: "logic",
  5: "labor",
  6: "luck",
  7: "duty",
  8: "talent",
  9: "memory",
};

function narrateCell(
  digit: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
  square: PythagorasSquareResult
): string {
  const count = square.cells[digit];
  const interp = square.interpretation[INTERP_BY_DIGIT[digit]];

  const label = CELL_NAMES[digit];
  const intensity =
    count === 0
      ? "Это **зона роста** — цифра в матрице отсутствует."
      : count === 1
        ? "Энергия **умеренная**, без перекоса."
        : count === 2
          ? "Показатель **устойчивый**, надёжный ресурс."
          : "Показатель **сильный**, заметный акцент личности.";

  return [
    `**${label.charAt(0).toUpperCase() + label.slice(1)} (${digit}):** ${cellLabel(digit, count)} — ${interp.summary}`,
    intensity,
  ].join(" ");
}

function buildFinalization(
  name: string,
  square: PythagorasSquareResult,
  profile: FullNumerologyProfile | null
): string {
  const empty = emptyCells(square);
  const strong = dominantCells(square);
  const strongLines = square.lines.rows
    .concat(square.lines.cols, square.lines.diagonals)
    .filter((l) => l.strength >= 3);

  const strengthText =
    strong.length > 0
      ? strong
          .map((d) => {
            const key = d as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
            return `${CELL_NAMES[d]} (${cellLabel(d, square.cells[key])})`;
          })
          .join("; ")
      : "умеренные показатели без резких пиков";

  const lessonText =
    empty.length > 0
      ? empty.map((d) => CELL_NAMES[d]).join(", ")
      : "все цифры представлены — уроки через «пустоту» не выражены";

  const lines = [
    "## Итог: кто ты по числам",
    "",
    `${name}, если собрать матрицу в одну картину:`,
    "",
    strongLines.length
      ? `**Опора:** ${strongLines.map((l) => l.label.toLowerCase()).join("; ")}. Это твои «несущие стены» — то, на что можно опираться в решениях.`
      : "**Опора:** стабильный фундамент без одной доминирующей линии — гибкость важнее жёсткой специализации.",
    "",
    `**Ресурс:** ${strengthText}.`,
    "",
    `**Урок:** ${lessonText}. Пустые ячейки — не «плохо», а место, где нужна осознанная дисциплина, а не надежда на «само пройдёт».`,
  ];

  if (empty.includes(3)) {
    lines.push(
      "",
      "**Главный вывод по здоровью и ресурсу:** пустая тройка при сильной воле (единица) — классический сценарий «тяну на характере». Беречь режим важнее, чем доказывать силу."
    );
  }

  if (profile?.personalYear.number) {
    lines.push(
      "",
      `**Фокус года ${profile.personalYear.number}:** ${profile.personalYear.title.toLowerCase()} — ${profile.personalYear.meaning.split(".").slice(0, 1).join(".")}.`
    );
  }

  lines.push(
    "",
    "## Три шага на ближайшее время",
    "",
    "— Опирайся на **сильные ячейки** — там результат приходит естественнее.",
    "— Поддерживай **слабые** простыми привычками, не рывками.",
    "— Личный год — фон для решений; квадрат — твоя базовая карта на всю жизнь."
  );

  return lines.join("\n");
}

export function buildPythagorasNarrativeReading(input: {
  name: string;
  square: PythagorasSquareResult;
  profile?: FullNumerologyProfile | null;
  spreadNumbers?: string[];
  simplify?: boolean;
}): string {
  const { name, square, profile = null, spreadNumbers, simplify } = input;
  const i = square.interpretation;

  if (simplify) {
    return [
      buildProfileIntro(name, profile),
      "",
      "## Коротко по матрице",
      "",
      narrateCell(1, square),
      "",
      narrateCell(2, square),
      "",
      narrateCell(3, square),
      "",
      buildFinalization(name, square, profile),
    ].join("\n");
  }

  const sections = [
    "## ✦ КВАДРАТ ПИФАГОРА",
    "",
    buildProfileIntro(name, profile),
    "",
    "## Ядро: характер, энергия, здоровье",
    "",
    narrateCell(1, square),
    "",
    narrateCell(2, square),
    "",
    narrateCell(3, square),
    "",
    i.health.count === 0
      ? "Сочетание **сильной единицы** и **пустой тройки** — частый маркер: внешне выдерживаешь, внутренний ресурс восстановления не безлимитный. Это ключ к пониманию усталости и хронических симптомов."
      : "",
    "",
    "## Разум, труд, удача",
    "",
    narrateCell(4, square),
    "",
    narrateCell(5, square),
    "",
    narrateCell(6, square),
    "",
    "## Глубина: долг, талант, память",
    "",
    narrateCell(7, square),
    "",
    narrateCell(8, square),
    "",
    narrateCell(9, square),
    "",
    "## Линии матрицы",
    "",
    ...square.lines.rows.concat(square.lines.cols).map(formatMatrixLineEntry),
    "",
    buildSpreadBridge(spreadNumbers, profile),
    "",
    buildFinalization(name, square, profile),
  ];

  return sections.filter((s) => s !== "").join("\n");
}

export function buildHealthNarrativeFinal(
  name: string,
  square: PythagorasSquareResult,
  profile: FullNumerologyProfile | null,
  options?: { symptom?: string | null; chronic?: boolean }
): string {
  const i = square.interpretation;
  const lines = [
    "## Итог по здоровью",
    "",
    `${name}, резюме **только по ячейкам 1–3**:`,
    "",
    `— **Восстановление (3):** ${cellLabel(3, i.health.count)} — ${i.health.summary}`,
    `— **Энергия (2):** ${cellLabel(2, i.energy.count)} — ${i.energy.summary}`,
    `— **Напор (1):** ${cellLabel(1, i.character.count)} — ${i.character.summary}`,
  ];

  if (options?.symptom) {
    lines.push("", `Твоё уточнение «${options.symptom}» укладывается в связку **пустой/слабой тройки + нагрузки на единицу** — не в выдуманные «период 4 / совет 5».`);
  }

  if (options?.chronic) {
    lines.push("", "**Хронический срок** усиливает урок: не «сколько месяцев лечить», а **сменить режим** — сон, стресс, ритм нагрузки.");
  }

  if (profile?.personalYear.number) {
    lines.push(
      "",
      `**Личный год ${profile.personalYear.number}** задаёт фон: ${profile.personalYear.title.toLowerCase()} — удобнее вводить новые привычки, чем ждать «идеального момента».`
    );
  }

  return lines.join("\n");
}

export function buildKarmaNarrativeReading(input: {
  name: string;
  birthDate: string;
  fullName: string;
  simplify?: boolean;
}): string {
  const { name, birthDate, fullName, simplify } = input;
  const debts = karmicDebts(birthDate, fullName);
  const lessons = karmicLessons(fullName);

  const debtBlock =
    debts.length > 0
      ? debts
          .map((d) => `— **${d}** — ${KARMIC_DEBT_HINTS[d] ?? "кармический урок через повторяющийся сценарий"}.`)
          .join("\n")
      : "— Кармические долги **13, 14, 16, 19** в сумме даты и имени **не выявлены** — это не «отсутствие кармы», а другой тип уроков.";

  const lessonBlock =
    lessons.length > 0
      ? lessons
          .map((n) => `— Цифра **${n}** отсутствует в имени — урок: ${LESSON_HINTS[n] ?? "развитие качества"}.`)
          .join("\n")
      : "— Все цифры **1–9** представлены в имени — уроки через «пустоту» в имени не выражены; смотрим долги и линии матрицы.";

  if (simplify) {
    return [
      `${name}, коротко про **карму** по расчёту движка.`,
      "",
      "## Долги",
      "",
      debtBlock,
      "",
      "## Уроки имени",
      "",
      lessonBlock,
    ].join("\n");
  }

  return [
    `${name}, разберём **карму** — только реальный расчёт по дате и имени, без выдуманных «путь / период».`,
    "",
    "## Кармические долги",
    "",
    debtBlock,
    "",
    "Долги — не «наказание», а **повторяющиеся сценарии**, которые прорабатываются осознанностью.",
    "",
    "## Уроки через имя",
    "",
    lessonBlock,
    "",
    "Отсутствующая цифра в имени — зона, где качество **нарабатывается**, а не «дано от рождения».",
    "",
    "## Как читать это вместе",
    "",
    debts.length > 0 && lessons.length > 0
      ? "Есть и **долги**, и **уроки имени** — карма проявляется и в повторяющихся ситуациях, и в том, что даётся через практику."
      : debts.length > 0
        ? "Акцент на **долгах** — важно замечать, где сценарий повторяется, и менять реакцию, не только обстоятельства."
        : lessons.length > 0
          ? "Акцент на **уроках имени** — развивай отсутствующие качества маленькими шагами каждый день."
          : "Ярко выраженных кармических маркеров в долгах и имени нет — опирайся на квадрат Пифагора и личный цикл для точечных тем.",
  ].join("\n");
}

export function buildForecastNarrativeReading(input: {
  name: string;
  birthDate: string;
  startYear?: number;
}): string {
  const { name, birthDate, startYear = new Date().getFullYear() } = input;
  if (!parseBirthDate(birthDate)) {
    return `${name}, для прогноза на 9 лет нужна дата рождения — назови её, посчитаю без догадок.`;
  }

  const forecast = personalYearForecast(birthDate, startYear, 9);
  const first = forecast[0];
  const last = forecast[forecast.length - 1];

  const yearBlocks = forecast.map((entry) => {
    const theme = personalYearTheme(entry.number);
    return [
      `### ${entry.year} — личный год ${entry.number}`,
      theme,
      entry.advice,
    ].join("\n");
  });

  return [
    `${name}, вот **прогноз на 9 личных лет** — только расчёт по дате рождения, без выдуманных цифр.`,
    "",
    `Цикл с **${startYear}** по **${startYear + 8}**. Личный год — это фон решений, не «приговор».`,
    "",
    first
      ? `**Старт (${first.year}):** год ${first.number} — ${first.theme.toLowerCase()}. ${first.advice}`
      : "",
    last && last.year !== first?.year
      ? `**Финиш (${last.year}):** год ${last.number} — ${last.theme.toLowerCase()}. ${last.advice}`
      : "",
    "",
    "## По годам",
    "",
    ...yearBlocks,
    "",
    "Сильные годы для старта — 1, 3, 5, 8. Годы 4 и 9 — про дисциплину и завершение: не форсируй, если цикл просит паузу.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildPersonalCycleNarrativeReading(input: {
  name: string;
  birthDate: string;
}): string {
  const { name, birthDate } = input;
  if (!parseBirthDate(birthDate)) {
    return `${name}, для личного цикла нужна дата рождения.`;
  }

  const now = new Date();
  const py = personalYear(birthDate, now.getFullYear());
  const pm = personalMonth(birthDate, now);
  const pd = personalDay(birthDate, now);

  return [
    `${name}, твой **личный цикл** сейчас — по реальному расчёту:`,
    "",
    `**Личный год ${now.getFullYear()}:** ${py.number} — ${py.title}. ${py.meaning.split(".").slice(0, 2).join(".")}.`,
    `**Личный месяц (${now.getMonth() + 1}/${now.getFullYear()}):** ${pm.number} — ${pm.title}.`,
    `**Личный день сегодня:** ${pd.number} — ${pd.title}.`,
    "",
    "Год задаёт стратегию, месяц — тактику, день — оттенок настроения. Не путай их с «судьбой на всю жизнь».",
  ].join("\n");
}

/** Plain-text portrait of life path — warm fallback when LLM is unavailable. */
export function buildLifePathNarrativeReading(input: {
  name: string;
  birthDate: string;
  fullName?: string;
  simplify?: boolean;
}): string {
  const { name, birthDate, fullName, simplify } = input;
  if (!parseBirthDate(birthDate)) {
    return `${name}, чтобы рассказать о твоём пути, мне нужна дата рождения — назови её, и я посчитаю код без догадок.`;
  }

  const profile = fullProfile(birthDate, fullName ?? name);
  const lp = profile.lifePath;
  if (lp.number <= 0) {
    return `${name}, не удалось посчитать число пути по этой дате — проверь формат даты рождения.`;
  }

  const masterNote = lp.isMaster ? " Это мастер-число — вибрация сильнее и требует осознанности." : "";
  const now = new Date();
  const py = profile.personalYear;

  const paragraphs: string[] = [
    `${name}, с удовольствием расскажу о твоём пути — это главное число нумерологии, оно показывает, как ты движешься по жизни, а не случайный набор событий.`,
    `Твоё число жизненного пути — ${lp.number}, ${lp.title}.${masterNote} ${lp.meaning.split(".").slice(0, 2).join(".")}.`,
  ];

  if (profile.destiny.number > 0 && !simplify) {
    paragraphs.push(
      `По имени видно число судьбы ${profile.destiny.number} — ${profile.destiny.title}. Оно дополняет путь: ${profile.destiny.meaning.split(".").slice(0, 1).join(".")}.`
    );
  }

  if (py.number > 0) {
    paragraphs.push(
      `Сейчас, в ${now.getFullYear()} году, у тебя личный год ${py.number} — ${py.title.toLowerCase()}. ${py.meaning.split(".").slice(0, 1).join(".")}. Это фон сезона, не приговор — путь остаётся твоей базой.`
    );
  }

  if (lp.keywords?.length && !simplify) {
    paragraphs.push(
      `Твои опорные качества по этому числу: ${lp.keywords.slice(0, 4).join(", ")}. Опирайся на них, когда сомневаешься, куда идти дальше.`
    );
  }

  paragraphs.push(
    "Если захочешь — разберём квадрат Пифагора, отношения или карму тем же методом: только расчёт, без выдуманных цифр."
  );

  return paragraphs.join("\n\n");
}
