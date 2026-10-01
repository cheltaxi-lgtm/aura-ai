import { lookupPhotoCardAlias } from "@/lib/photo-card-aliases";

export function normalizePhotoInterpretation(text: string): string {
  return text.replace(/^\s*#{1,6}\s*/gmu, "").replace(/\*{1,3}/gu, "").replace(/_{2,3}/gu, "").trim();
}

function words(value: string): string[] {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/gu, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/u).filter(Boolean);
}

const MINOR_RANKS: Array<[RegExp, string]> = [
  [/^двойк/u, "2"], [/^тройк/u, "3"], [/^четверк/u, "4"], [/^пятерк/u, "5"],
  [/^шестерк/u, "6"], [/^семерк/u, "7"], [/^восьмерк/u, "8"], [/^девятк/u, "9"], [/^десятк/u, "10"],
];

// Explicit inflections keep close names distinct: Король != Королева, Суд != Судьба.
const CARD_WORDS: Array<[RegExp, string]> = [
  [/^туз(?:а|у|ом|е)?$/u, "туз"], [/^паж(?:а|у|ем|е)?$/u, "паж"],
  [/^рыцар(?:ь|я|ю|ем|е)$/u, "рыцарь"], [/^корол(?:ь|я|ю|ем|е)$/u, "король"],
  [/^королев(?:а|ы|е|у|ой|ою)$/u, "королева"],
  [/^(?:кубк(?:и|ов|ами|ах|ам|а)|чаш(?:а|и|е|у|ей|ами|ах|ам))$/u, "кубки"],
  [/^(?:пентакл(?:и|ей|ями|ях|ям|я)|монет(?:а|ы|е|у|ой|ам|ами|ах)?|диск(?:и|ов|ами|ах|ам|а)|денари(?:и|ев|ями|ях))$/u, "пентакли"],
  [/^(?:жезл(?:ы|ов|ами|ах|ам|а)|посох(?:и|ов|ами|ах|ам|а))$/u, "жезлы"],
  [/^меч(?:и|ей|ами|ах|ам|а)$/u, "мечи"],
  [/^шут(?:а|у|ом|е)?$/u, "шут"], [/^маг(?:а|у|ом|е)?$/u, "маг"],
  [/^суд(?:а|у|ом|е)?$/u, "суд"], [/^мир(?:а|у|ом|е)?$/u, "мир"],
  [/^сил(?:а|ы|е|у|ой|ою)$/u, "сила"], [/^солнц(?:е|а|у|ем)$/u, "солнце"],
  [/^лун(?:а|ы|е|у|ой|ою)$/u, "луна"], [/^звезд(?:а|ы|е|у|ой|ою)$/u, "звезда"],
  [/^башн(?:я|и|е|ю|ей|ею)$/u, "башня"], [/^жриц(?:а|ы|е|у|ей|ею)$/u, "жрица"],
  [/^императриц(?:а|ы|е|у|ей|ею)$/u, "императрица"],
  [/^колесниц(?:а|ы|е|у|ей|ею)$/u, "колесница"],
  [/^смерт(?:ь|и|ью)$/u, "смерть"], [/^дьявол(?:а|у|ом|е)?$/u, "дьявол"],
  [/^император(?:а|у|ом|е)?$/u, "император"], [/^отшельник(?:а|у|ом|е)?$/u, "отшельник"],
  [/^иерофант(?:а|у|ом|е)?$/u, "иерофант"],
  [/^влюбленн(?:ые|ых|ым|ыми)$/u, "влюбленные"], [/^повешенн(?:ый|ого|ому|ым|ом)$/u, "повешенный"],
  [/^умеренност(?:ь|и|ью)$/u, "умеренность"], [/^справедливост(?:ь|и|ью)$/u, "справедливость"],
  [/^колес(?:о|а|у|ом|е)$/u, "колесо"], [/^фортун(?:а|ы|е|у|ой|ою)$/u, "фортуна"],
];

function rankWord(word: string): string {
  const rank = MINOR_RANKS.find(([pattern]) => pattern.test(word))?.[1];
  if (rank) return rank;
  const card = CARD_WORDS.find(([pattern]) => pattern.test(word))?.[1];
  return card ? `~${card}` : word;
}

function containsName(textWords: string[], name: string): boolean {
  const nameWords = words(lookupPhotoCardAlias(name) ?? name).map(rankWord);
  return nameWords.length > 0 && textWords.some((_, start) => nameWords.every((word, offset) =>
    word.startsWith("~") || word.length <= 3 ? textWords[start + offset] === word : textWords[start + offset]?.startsWith(word.slice(0, 4))
  ));
}

/** Exact deck aliases only: never guess a card from arbitrary prose. */
function paragraphWords(paragraph: string): string[] {
  const original = words(paragraph);
  const expanded = original.map(rankWord);
  for (let start = 0; start < original.length; start += 1) {
    for (let length = 1; length <= Math.min(8, original.length - start); length += 1) {
      const alias = lookupPhotoCardAlias(original.slice(start, start + length).join(" "));
      if (alias) expanded.push("|", ...words(alias).map(rankWord), "|");
    }
  }
  return expanded;
}

export function isUncertainPhotoCardName(name: string): boolean {
  return /вероятн|возможн|не\s*определ|не\s*распозн|неясн|неизвестн|неуточн/iu.test(name) ||
    ` ${words(name).join(" ")} `.includes(" или ");
}

function acknowledgesCardUncertainty(paragraph: string): boolean {
  const identity = /^(?:карт(?:а|ы|е|у|ой|ою|ами|ах)|символ(?:ы|а|у|ом|е)?|названи(?:е|я|ю|ем|и)|пентакл[а-я]*|кубк[а-я]*|жезл[а-я]*|меч(?:и|ей|а|ом|е))$/u;
  const modifier = /^(?:в|на|этой|данной|последней|первой|второй|третьей|позиции|фото|изображении|здесь|там|пока|точно|однозначно|полностью|еще|окончательно|остается|какая|какой|какое|именно|это)$/u;
  const uncertainIdentity = /^(?:определ[её]н[а-я]*|распознан[а-я]*|уточн[её]н[а-я]*|различим[а-я]*)$/u;
  return paragraph.split(/[.!?;\n]/u).some(clause => {
    const tokens = words(clause);
    const skipModifiers = (start: number): number => {
      let next = start;
      while (next < tokens.length && (modifier.test(tokens[next]) ||
        (tokens[next - 1] === "позиции" && /^(?:[1-9]|1[0-2])$/u.test(tokens[next])))) next += 1;
      return next;
    };
    const negativePredicate = (start: number): boolean => {
      if (tokens[start] !== "не") return false;
      const next = /^(?:была|был|было|были)$/u.test(tokens[start + 1] ?? "") ? start + 2 : start + 1;
      return uncertainIdentity.test(tokens[next] ?? "");
    };
    return tokens.some((token, index) => {
      if (identity.test(token)) {
        const next = skipModifiers(index + 1);
        return negativePredicate(next) ||
          /^(?:неясн|неизвестн|неуточн)[а-я]*$/u.test(tokens[next] ?? "");
      }
      // "Не распознанная точно карта", "неясно, какая именно карта".
      const negative = token === "не" && uncertainIdentity.test(tokens[index + 1] ?? "");
      const unclear = /^(?:неясн|неизвестн|неуточн)[а-я]*$/u.test(token);
      if (negative || unclear) {
        const next = skipModifiers(index + (negative ? 2 : 1));
        return identity.test(tokens[next] ?? "");
      }
      if (/^(?:невозможно|нельзя|трудно)$/u.test(token) && /^(?:определить|распознать|различить|назвать)$/u.test(tokens[index + 1] ?? "")) {
        const next = skipModifiers(index + 2);
        return identity.test(tokens[next] ?? "");
      }
      return false;
    });
  });
}

function coversUncertainCard(paragraph: string, textWords: string[], name: string, position: number): boolean {
  // The answer must preserve uncertainty; choosing a likely card as fact is not coverage.
  if (!acknowledgesCardUncertainty(paragraph)) return false;
  const suit = words(name).find(word => /^(?:пентакл|монет|дисков|денари|кубк|чаш|меч|жезл|посох)/u.test(word));
  if (suit && containsName(textWords, suit)) return true;
  const baseName = name.split(/[([]/u)[0].trim();
  if (!isUncertainPhotoCardName(baseName) && containsName(textWords, baseName)) return true;
  // Author/oracle labels may have no identifiable suit. Require an explicit position.
  return new RegExp(`позици[а-яё]*\\s+(?:№\\s*)?${position}(?!\\d)`, "iu").test(paragraph);
}

export type PhotoInterpretationAssessment = {
  ok: boolean;
  detail: string;
  missingCardPositions: number[];
};

export function assessPhotoInterpretation(text: string, cardCount: number, spreadSummary: string): PhotoInterpretationAssessment {
  const clean = normalizePhotoInterpretation(text);
  const paragraphs = clean.split(/\n\s*\n/u).map(p => p.trim()).filter(Boolean);
  const fail = (detail: string, missingCardPositions: number[] = []): PhotoInterpretationAssessment =>
    ({ ok: false, detail, missingCardPositions });
  if (!Number.isInteger(cardCount) || cardCount < 1) return fail("invalid_spread_summary");
  if (clean.length < Math.max(200, cardCount * 90)) return fail("insufficient_length");
  if (paragraphs.length < cardCount + 1) return fail("insufficient_paragraphs");
  const rows = Array.from(spreadSummary.matchAll(/^(\d+)\.\s+(.+)$/gmu));
  const listedCards = rows.map(match => Array.from(match[2].matchAll(/«([^»]+)»/gu), name => name[1]));
  if (listedCards.length !== cardCount || listedCards.some((names, index) => !names.length || Number(rows[index][1]) !== index + 1)) {
    return fail("invalid_spread_summary");
  }
  const normalizedParagraphs = paragraphs.map(paragraphWords);
  const candidates = listedCards.map((alternatives, cardIndex) => paragraphs.flatMap((paragraph, paragraphIndex) => {
    if (paragraph.length < 70) return [];
    const uncertain = alternatives.some(isUncertainPhotoCardName);
    const covered = alternatives.some(name => uncertain
      ? coversUncertainCard(paragraph, normalizedParagraphs[paragraphIndex], name, cardIndex + 1)
      : containsName(normalizedParagraphs[paragraphIndex], name));
    return covered ? [paragraphIndex] : [];
  }));
  // One substantive paragraph per position. Reassign overlapping matches instead of
  // greedily consuming a paragraph needed by another card (including duplicate cards).
  const owners = new Map<number, number>();
  const assign = (card: number, seen: Set<number>): boolean => {
    for (const paragraph of candidates[card]) {
      if (seen.has(paragraph)) continue;
      seen.add(paragraph);
      const owner = owners.get(paragraph);
      if (owner === undefined || assign(owner, seen)) {
        owners.set(paragraph, card);
        return true;
      }
    }
    return false;
  };
  const missing = listedCards.flatMap((_, index) => assign(index, new Set()) ? [] : [index + 1]);
  return missing.length ? fail(`missing_card_positions:${missing.join(",")}`, missing) :
    { ok: true, detail: "complete", missingCardPositions: [] };
}

export function hasPhotoInterpretationDepth(text: string, cardCount: number, spreadSummary: string): boolean {
  return assessPhotoInterpretation(text, cardCount, spreadSummary).ok;
}
