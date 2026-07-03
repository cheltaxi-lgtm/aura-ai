import type { SpreadId } from "@/lib/spreads";
import type { RitualType } from "@/lib/ritual-config";
import {
  recommendRitualForPhotoQuestion,
  ritualHrefForQuestion,
} from "@/lib/photo-followups";

export type DailyFollowUpChip = {
  label: string;
  question: string;
};

const LOVE_POSITIONS = /отношен|любов|партн|сердц/i;
const WORK_POSITIONS = /дел|работ|карьер/i;

export function buildDailyFollowUpChips(spreadId: SpreadId, positions: string[]): DailyFollowUpChip[] {
  const posText = positions.join(" ");
  const chips: DailyFollowUpChip[] = [
    {
      label: "Что делать сегодня?",
      question: "Исходя из расклада на сутки — что мне сделать сегодня в первую очередь?",
    },
    {
      label: "Скрытый знак",
      question: "Какой скрытый знак несёт этот расклад на сутки?",
    },
    {
      label: "Завтра",
      question: "Как энергия сегодняшнего дня повлияет на завтра?",
    },
  ];

  if (spreadId === "daily-extended" || LOVE_POSITIONS.test(posText)) {
    chips.unshift({
      label: "Отношения",
      question: "Раскрой подробнее сферу «Отношения» из сегодняшнего расклада.",
    });
  }
  if (WORK_POSITIONS.test(posText)) {
    chips.unshift({
      label: "Дела и работа",
      question: "Как лучше прожить сегодняшний блок «Дела» из расклада?",
    });
  }

  return chips.slice(0, 5);
}

export function dailyRitualType(readingText: string, positions: string[]): RitualType | null {
  return recommendRitualForPhotoQuestion(`${readingText} ${positions.join(" ")}`);
}

export function dailyRitualHref(readingText: string, positions: string[]): string | null {
  return ritualHrefForQuestion(`${readingText} ${positions.join(" ")}`);
}

export function showDailyJointReading(spreadId: SpreadId, positions: string[]): boolean {
  if (spreadId === "daily-extended") return true;
  return positions.some((p) => LOVE_POSITIONS.test(p));
}

export function dailyJointReadingHref(): string {
  return "/joint-reading";
}
