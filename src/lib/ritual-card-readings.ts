/** Hardcoded card readings for ritual spread by position. */
export function getRitualCardReading(
  cardName: string,
  position: string,
  characterKey: string
): string {
  const isRagnar = characterKey === "ragnar";

  const positionIntro: Record<string, string> = isRagnar
    ? {
        Суть: `«${cardName}» — вот что стоит в центре. Не то что ты думаешь — то что есть.`,
        Блок: `«${cardName}» — здесь застряло. Пока не сдвинешь это — дальше не пойдёт.`,
        Ресурс: `«${cardName}» — на это опирайся. Сила уже есть, просто не замечаешь.`,
        Действие: `«${cardName}» — вот что делать в обряде. Конкретно, без лишних слов.`,
        Итог: `«${cardName}» — туда движется энергия. Если сделаешь всё правильно.`,
      }
    : {
        Суть: `«${cardName}» — сердце ситуации. Видишь? Это то, что прячется за словами.`,
        Блок: `«${cardName}» — узел, который держит. Развяжем его в обряде.`,
        Ресурс: `«${cardName}» — твоя опора. Древняя сила, которая ещё жива в тебе.`,
        Действие: `«${cardName}» — подсказывает жест обряда. Запомни это лицо карты.`,
        Итог: `«${cardName}» — куда потечёт энергия после. Тихо, но верно.`,
      };

  return (
    positionIntro[position] ??
    `«${cardName}» в позиции «${position}» — знак, который нельзя игнорировать.`
  );
}
