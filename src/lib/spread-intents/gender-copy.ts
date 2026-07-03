import type { SpreadIntentDefinition } from "./types";
import { getSpreadIntentBySlug } from "./registry";

export type UserGender = "male" | "female" | null | undefined;

export type IntentDisplayCopy = {
  title: string;
  intro: string;
  questionTemplate: string;
};

/** Female user → partner «он»; male user → partner «она». */
function adaptLoveCopyForMaleUser(text: string): string {
  if (!text) return text;

  const pairs: Array<[RegExp, string]> = [
    [/Есть ли у него другая женщина/gi, "Есть ли у неё другой"],
    [/Есть ли у него другая/gi, "Есть ли у неё другой"],
    [/Стоит ли написать первой/gi, "Стоит ли написать первым"],
    [/написать ему первой/gi, "написать ей первым"],
    [/Почему я одна\b/g, "Почему я один"],
    [/соперницы/gi, "соперника"],
    [/его сердце/gi, "её сердце"],
    [/Ждать его/gi, "Ждать её"],
    [/у него/gi, "у неё"],
    [/Его /g, "Её "],
    [/его /gi, "её "],
    [/ ему/gi, " ей"],
    [/^Любит ли он/gi, "Любит ли она"],
    [/^Вернётся ли он/gi, "Вернётся ли она"],
    [/^Почему он/gi, "Почему она"],
    [/^Что он/gi, "Что она"],
    [/ он /gi, " она "],
    [/ он\?/gi, " она?"],
    [/ он,/gi, " она,"],
    [/ он\./gi, " она."],
  ];

  let out = text;
  for (const [pattern, replacement] of pairs) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function resolveIntentCopy(
  intent: SpreadIntentDefinition,
  userGender?: UserGender
): IntentDisplayCopy {
  if (intent.category !== "love" || userGender !== "male") {
    return {
      title: intent.title,
      intro: intent.intro,
      questionTemplate: intent.questionTemplate,
    };
  }

  return {
    title: adaptLoveCopyForMaleUser(intent.title),
    intro: adaptLoveCopyForMaleUser(intent.intro),
    questionTemplate: adaptLoveCopyForMaleUser(intent.questionTemplate),
  };
}

export function resolveIntentTitleBySlug(slug: string, userGender?: UserGender): string {
  const intent = getSpreadIntentBySlug(slug);
  if (!intent) return slug;
  return resolveIntentCopy(intent, userGender).title;
}

export function formatQuickQuestionLabel(title: string): string {
  const t = title.trim();
  return t.endsWith("?") ? t : `${t}?`;
}
