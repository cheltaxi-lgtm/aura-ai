/** Rules for paid spreads with a free-form client question. */

const THIRD_PARTY_WORDS = [
  "он ",
  "она ",
  "его ",
  "её ",
  "ему ",
  "ей ",
  "муж",
  "жена",
  "жены",
  "жене",
  "парень",
  "парня",
  "девушк",
  "брат",
  "сестр",
  "шурин",
  "зять",
  "свекров",
  "свёкор",
  "свекор",
  "тещ",
  "тест",
  "родител",
  "мама",
  "мамы",
  "маме",
  "папа",
  "папы",
  "папе",
  "сын",
  "дочь",
  "ребён",
  "ребен",
  "родствен",
  "коллег",
  "начальник",
  "бывш",
  "любовниц",
  "партнёр",
  "партнер",
  "человек",
  "мужчин",
  "женщин",
  "подруг",
  "знаком",
  "сосед",
  "командир",
  "воен",
  "фронт",
  "сво",
  "спецоперац",
];

const SELF_PHRASES = [
  "со мной",
  "обо мне",
  "что со мной",
  "что мне",
  "мой путь",
  "моя жизн",
  "моё предназнач",
  "мое предназнач",
  "моя судьб",
  "моей судьб",
  "жив ли я",
  "жива ли я",
];

/** «он?» / «жив ли он» — word, not only «он » with a trailing space. */
const THIRD_PARTY_PRONOUN_RE = /(^|[^\p{L}])(он|она|его|её|ее|ему|ей)(?=$|[^\p{L}])/iu;

const LIFE_STATUS_RE =
  /жив(?:а|о)?\s+ли|пропал[аио]?|без вести|выживет|погиб(?:ла|ло)?|ранен[ао]?/i;

/**
 * Client profile name is the querent. Never substitute it for the person
 * the question is about unless the client typed that name themselves.
 */
export const CLIENT_VS_SUBJECT_NAME_RULE =
  "ИМЯ КЛИЕНТА ≠ СУБЪЕКТ ВОПРОСА: имя в профиле — кто спрашивает. Человека из вопроса называй только так, как назвал клиент (он/она, муж, сын, конкретное имя). ЗАПРЕЩЕНО подставлять имя клиента вместо «он/пропавший», если клиент это имя в вопросе не писал.";

function includesAny(haystack: string, needles: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

/** Question is about someone/something other than the querent. */
export function isThirdPartyCustomQuestion(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  if (LIFE_STATUS_RE.test(q) && !includesAny(q, SELF_PHRASES)) return true;
  const hasThirdParty =
    THIRD_PARTY_PRONOUN_RE.test(q) || includesAny(q, THIRD_PARTY_WORDS);
  if (!hasThirdParty) return false;
  const hasSelfOnly =
    includesAny(q, SELF_PHRASES) &&
    !includesAny(q, ["брат", "сестр", "шурин", "муж", "жена", "жены"]) &&
    !THIRD_PARTY_PRONOUN_RE.test(q);
  return !hasSelfOnly;
}

/** Extra system-prompt block for custom intention spreads. */
export function customQuestionSpreadRules(question: string): string {
  const q = question.trim();
  if (!q) return "";

  const base = `
КОНКРЕТНЫЙ ВОПРОС КЛИЕНТА: «${q}»
— Каждая позиция расклада отвечает ТОЛЬКО на эту формулировку.
— Не подменяй вопрос темой из каталога, «энергией дня», прошлыми сеансами или профилем клиента.
— Не выдумывай факты вне символов.`;

  if (isThirdPartyCustomQuestion(q)) {
    return `${base}
— СУБЪЕКТ РАСКЛАДА — человек или ситуация ИЗ ВОПРОСА, не сам клиент.
— ${CLIENT_VS_SUBJECT_NAME_RULE}
— Имя и знак клиента — только как спрашивающий (его тревога, роль, что ему важно услышать).
— ЗАПРЕЩЕНО читать карты как «внутреннюю трансформацию клиента», «его знак в позициях», «зеркало его дня».
— Не подмешивай полиграф, любовь, карьеру клиента, если этого нет в вопросе.`;
  }

  return `${base}
— Знак и имя клиента — контекст, но не заменяй ими вопрос общей «работой над собой».`;
}
