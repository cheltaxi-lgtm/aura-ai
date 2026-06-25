import type { Character } from "@/types";
import { CHARACTERS, getCharacterById } from "./characters";

export type MasterKind = "ai" | "human";

export interface ShowcaseMaster extends Character {
  kind: MasterKind;
  slug: string;
  styleNotes?: string;
  profilePath?: string;
}

const AI_IDS = new Set(CHARACTERS.map((c) => c.id));

export function characterToMaster(character: Character): ShowcaseMaster {
  return {
    ...character,
    kind: "ai",
    slug: character.id,
    profilePath: `/master/${character.id}`,
  };
}

export function getAiMasters(): ShowcaseMaster[] {
  return CHARACTERS.map(characterToMaster);
}

export function findShowcaseMaster(
  id: string,
  masters?: ShowcaseMaster[]
): ShowcaseMaster | undefined {
  if (masters?.length) {
    return masters.find((m) => m.id === id || m.slug === id);
  }
  const ai = getCharacterById(id);
  if (ai) return characterToMaster(ai);
  return undefined;
}

export function isAiMasterId(id: string): boolean {
  return AI_IDS.has(id);
}

export function recommendShowcaseMaster(
  cards: { name: string; meaning: string }[],
  masters: ShowcaseMaster[]
): string | undefined {
  if (!masters.length) return undefined;

  const present = cards[1]?.meaning.toLowerCase() ?? cards[0]?.meaning.toLowerCase() ?? "";
  const love = /люб|отношен|сердц|партн|чувств|брак/i;
  const money = /денег|бизнес|работ|карьер|богат|успех|прибыл|финанс/i;
  const family = /семь|дом|род|дет|матер|отец|защит/i;
  const karma = /предназнач|дух|душ|смысл|путь|судьб|karma|карм/i;

  const pick = (predicate: (m: ShowcaseMaster) => boolean) =>
    masters.find(predicate)?.id ?? masters[0]?.id;

  if (love.test(present)) {
    return pick((m) => /люб|отношен|таро|psych/i.test(`${m.specialty} ${m.title}`)) ?? "veronika";
  }
  if (money.test(present)) {
    return pick((m) => /денег|бизнес|рун|money/i.test(`${m.specialty} ${m.title}`)) ?? "ragnar";
  }
  if (family.test(present)) {
    return pick((m) => /семь|вед|family/i.test(`${m.specialty} ${m.title}`)) ?? "agafya";
  }
  if (karma.test(present)) {
    return pick((m) => /karma|astro|джйотиш|предназнач/i.test(`${m.specialty} ${m.title}`)) ?? "shri-raj";
  }
  const numbers = /числ|цифр|код|нумер|этап|период/i;
  if (numbers.test(present)) {
    return pick((m) => m.system === "numerology") ?? "numerolog";
  }

  return masters.find((m) => m.kind === "ai")?.id ?? masters[0]?.id;
}
