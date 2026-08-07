/**
 * Default mini-landing sections (Avito-style offer skeleton).
 * Practitioners edit these in /pro/landing; public page reads published copy.
 */

export type ProLandingIncludeBlock = {
  title: string;
  body: string;
};

export type ProLandingSections = {
  who: string;
  what_you_get: string;
  includes: {
    natal: ProLandingIncludeBlock;
    matrix: ProLandingIncludeBlock;
    hd: ProLandingIncludeBlock;
  };
  accuracy: string;
  how_it_works: string;
  wont_do: string;
  cta: string;
};

/** Public wire shape for /p/[slug] (safe for client imports). */
export type ProLandingPublicPayload = {
  slug: string;
  displayName: string;
  bio: string | null;
  specializations: string[];
  accentColor: string | null;
  logoUrl: string | null;
  contactPublic: string | null;
  headline: string;
  subheadline: string;
  promoBadge: string | null;
  priceRub: number | null;
  promoLimit: number | null;
  promoUsed: number;
  promoRemaining: number | null;
  sections: ProLandingSections;
  contactNote: string | null;
  intakeUrl: string;
  ctaLabel: string;
};

export const DEFAULT_LANDING_SECTIONS: ProLandingSections = {
  who: `Меня зовут [Имя]. Я создатель онлайн-платформы по астрологии и системам самопознания.

Моя платформа автоматически рассчитывает натальные карты, матрицы судьбы, бодиграфы Дизайна Человека, нумерологию и расклады. Астрономическое ядро — расчёт положений планет, домов, лунных узлов — написано с нуля и сверяется с эталонными данными.

Почему бесплатно (или по спецпредложению)?
Платформа выдаёт разборы автоматически. Я хочу лично провести серию глубоких разборов, чтобы понять, какие вопросы люди задают на самом деле и где автоматика уступает живому анализу. Мне важна ваша обратная связь по результату.`,

  what_you_get: `— Почему у вас не получается то, что у других выходит легко — и что с этим делать
— Как вы принимаете решения: почему одни верные, а о других потом жалеете
— Где ваш ресурс и куда он утекает: какая работа наполняет, а какая выжимает
— Что в вас ваше, а что взято от родителей и рода (повторяющиеся сценарии)
— Как вы устроены в отношениях: что вам нужно от партнёра и почему возникает «стена»
— Сильные стороны, которые вы за собой не замечаете

Никаких общих фраз вроде «вы Лев — значит, творческий». Только точный разбор вашей карты с примерами из реальной жизни.`,

  includes: {
    natal: {
      title: "Натальная карта (5–7 страниц)",
      body: "Планеты в знаках, домах и аспектах, асцендент, МС, баланс стихий. Сферы реализации, денег и отношений.",
    },
    matrix: {
      title: "Матрица судьбы (4–6 страниц)",
      body: "Ключевые энергии, финансовый канал, предназначение, родовые программы по матери и отцу, кармический хвост — задача, которая повторяется из раза в раз.",
    },
    hd: {
      title: "Дизайн человека / бодиграф (4–6 страниц)",
      body: "Тип, стратегия, внутренний авторитет, профиль, определённые и открытые центры, каналы, ворота, инкарнационный крест. Для пар — совместимость: композит и связи между вами.",
    },
  },

  accuracy: `Если вбить одну дату в три бесплатных калькулятора — вы получите три разных результата: разные дома, разные градусы, у Дизайна Человека иногда даже разный тип. Там используют приближённые формулы.

Я считаю по эфемеридам, сверенным с эталонными данными. Расчёт автоматически проверяется автотестами при каждом изменении — сотни сверок с эталонными картами.`,

  how_it_works: `Оставьте заявку на этой странице: какой разбор нужен, дата, точное время и город рождения.
Один уточняющий вопрос по разбору — бесплатно.
Если точного времени рождения не знаете — всё равно посчитаю и отдельно отмечу, какие выводы остаются верными, а какие зависят от времени.`,

  wont_do: `— предсказаний событий, дат, свадеб и переездов
— «порч», «венцов безбрачия» и снятия чего бы то ни было
— медицинских диагнозов и финансовых советов
— обещаний, что жизнь изменится сама

Это системы описания личности через дату рождения. Формат познавательный, 18+. Не заменяет консультацию врача или психолога. Данные рождения использую только для расчёта.`,

  cta: "Оставить заявку",
};

export const DEFAULT_LANDING_COPY = {
  headline: "Полный разбор карты",
  subheadline:
    "Разберу вашу натальную карту, матрицу судьбы или карту Дизайна Человека.",
  promo_badge: "Первые 10 полных разборов — бесплатно",
  price_rub: 1490,
  promo_limit: 10,
  contact_note: "Отвечаю в течение дня после заявки.",
} as const;

export function normalizeLandingSections(raw: unknown): ProLandingSections {
  const base = DEFAULT_LANDING_SECTIONS;
  if (!raw || typeof raw !== "object") return { ...base, includes: { ...base.includes } };
  const o = raw as Record<string, unknown>;
  const inc =
    o.includes && typeof o.includes === "object"
      ? (o.includes as Record<string, unknown>)
      : {};
  const block = (
    key: "natal" | "matrix" | "hd",
    fallback: ProLandingIncludeBlock
  ): ProLandingIncludeBlock => {
    const b = inc[key];
    if (!b || typeof b !== "object") return { ...fallback };
    const row = b as Record<string, unknown>;
    return {
      title: typeof row.title === "string" ? row.title : fallback.title,
      body: typeof row.body === "string" ? row.body : fallback.body,
    };
  };
  return {
    who: typeof o.who === "string" ? o.who : base.who,
    what_you_get: typeof o.what_you_get === "string" ? o.what_you_get : base.what_you_get,
    includes: {
      natal: block("natal", base.includes.natal),
      matrix: block("matrix", base.includes.matrix),
      hd: block("hd", base.includes.hd),
    },
    accuracy: typeof o.accuracy === "string" ? o.accuracy : base.accuracy,
    how_it_works: typeof o.how_it_works === "string" ? o.how_it_works : base.how_it_works,
    wont_do: typeof o.wont_do === "string" ? o.wont_do : base.wont_do,
    cta: typeof o.cta === "string" && o.cta.trim() ? o.cta : base.cta,
  };
}
