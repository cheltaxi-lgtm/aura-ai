/** Detect life/war/survival questions where textbook "romance" card glosses poison the reading. */
export function isCrisisSurvivalQuestion(text?: string | null): boolean {
  const t = (text ?? "").toLowerCase().replace(/ё/g, "е");
  if (!t.trim()) return false;
  return /войн|с фронта|из зоны|сво|мобилиз|погиб|ранен|живым|выживет|выживет ли|вернется ли.*жив|похорон|умрет|умрёт|смерт|убит|плен|пропал без вести/.test(
    t
  );
}
