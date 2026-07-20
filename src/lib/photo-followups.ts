import type { RitualType } from "@/lib/ritual-config";
import { ritualPageSlug } from "@/lib/ritual-recommendations";

export type PhotoFollowUpChip = {
  label: string;
  question: string;
};

const LOVE_KEYWORDS = /любов|отношен|он |она |партн|бывш|измен|свидан|брак|развод/i;
const MONEY_KEYWORDS = /деньг|доход|финанс|долг|кредит|зарплат|богат/i;
const CAREER_KEYWORDS = /работ|карьер|началь|коллег|уволь|собесед|бизнес|проект|экзамен/i;
const HEALTH_KEYWORDS = /здоров|болезн|сил[аы]|сон|усталост|восстанов|тело|самочувств/i;
const FUTURE_KEYWORDS = /будущ|прогноз|что жд|через месяц|через год/i;
const RELEASE_KEYWORDS = /отпуст|расст|прошл|боль|обид|прощ/i;

export function recommendRitualForPhotoQuestion(question: string): RitualType | null {
  const q = question.trim();
  if (!q) return null;
  if (RELEASE_KEYWORDS.test(q)) return "release";
  if (HEALTH_KEYWORDS.test(q)) return "health";
  if (MONEY_KEYWORDS.test(q)) return "money";
  if (CAREER_KEYWORDS.test(q)) return "career";
  if (LOVE_KEYWORDS.test(q)) return "love";
  if (/защит|энерг|сглаз|негатив/i.test(q)) return "protection";
  if (/удач|шанс|форту/i.test(q)) return "luck";
  return null;
}

export function ritualHrefForQuestion(question: string): string | null {
  const type = recommendRitualForPhotoQuestion(question);
  if (!type) return null;
  return `/obryady/${ritualPageSlug(type)}`;
}

export function buildPhotoFollowUpChips(question: string): PhotoFollowUpChip[] {
  const q = question.trim();
  const chips: PhotoFollowUpChip[] = [
    {
      label: "Что делать дальше?",
      question: "Исходя из этого расклада — что мне делать дальше?",
    },
    {
      label: "Сроки",
      question: "Когда может сдвинуться ситуация из расклада?",
    },
    {
      label: "Скрытый аспект",
      question: "Что я ещё не вижу в этой ситуации?",
    },
  ];

  if (LOVE_KEYWORDS.test(q)) {
    chips.unshift({
      label: "Его чувства",
      question: "Что он чувствует ко мне сейчас — уточни по этому раскладу?",
    });
  }
  if (MONEY_KEYWORDS.test(q) || CAREER_KEYWORDS.test(q)) {
    chips.unshift({
      label: "Практический шаг",
      question: "Какой конкретный шаг даст лучший результат в ближайший месяц?",
    });
  }
  if (FUTURE_KEYWORDS.test(q)) {
    chips.unshift({
      label: "Ближайший месяц",
      question: "Как развернётся ситуация в ближайший месяц?",
    });
  }

  return chips.slice(0, 5);
}
