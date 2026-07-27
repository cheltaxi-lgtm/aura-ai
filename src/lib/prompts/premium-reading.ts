/**
 * Shared premium paid-spread contract — thematic depth + grounded rules + final conclusion.
 * Used by photo, human reading, chat long-form, daily-energy, joint synthesis.
 */
import {
  CARD_GROUNDED_READING_RULES,
  spreadFinalConclusionRules,
  thematicSpreadReadingRules,
} from "@/lib/prompts/format";
import {
  isTarotRuneMasterId,
  tarotRuneThematicReadingRules,
} from "@/lib/prompts/tarot-rune-format";

export interface PaidSpreadReadingExtrasOpts {
  cardCount: number;
  masterId?: string;
  /** When false, skip final conclusion (tarot-rune masters use ## Простыми словами instead). */
  includeFinalConclusion?: boolean;
  /**
   * When false (default), only honesty is appended — use when buildSystemPrompt /
   * buildCharacterPrompt already included grounded + thematic + final.
   * Set true for paths that start from chat persona (photo, daily-energy).
   */
  includeDepthBlocks?: boolean;
}

/** Token budget for a paid full spread — scales with card count. */
export function paidSpreadMaxTokens(cardCount: number): number {
  const n = Math.max(1, cardCount);
  return Math.min(5000, Math.max(2800, 1800 + n * 350));
}

/**
 * Overlay for an already-paid full reading.
 * Default: honesty only (avoids duplicating blocks already in buildSystemPrompt).
 * Does not include persona — layer this on top of character/human prompts.
 */
export function buildPaidSpreadReadingExtras(opts: PaidSpreadReadingExtrasOpts): string {
  const n = Math.max(1, opts.cardCount);
  const tarotRune = isTarotRuneMasterId(opts.masterId ?? "");
  const includeDepth = opts.includeDepthBlocks === true;
  const includeFinal =
    opts.includeFinalConclusion ?? (includeDepth && !tarotRune);

  const parts: string[] = [];
  if (includeDepth) {
    parts.push(CARD_GROUNDED_READING_RULES);
    parts.push(tarotRune ? tarotRuneThematicReadingRules(n) : thematicSpreadReadingRules(n));
  }
  if (includeFinal) parts.push(spreadFinalConclusionRules(n));
  parts.push(PREMIUM_PAID_READING_HONESTY);
  return parts.filter(Boolean).join("\n\n");
}

/** Honesty addendum for paid spreads — verdict first, no sugar. */
export const PREMIUM_PAID_READING_HONESTY = `
ЧЕСТНОСТЬ ОПЛАЧЕННОГО РАСКЛАДА (обязательно):
- Сначала вердикт по доминирующим символам: жёстко / в плюс / смешанно. Тон ответа = вердикт.
- Жёсткий расклад — не выравнивай надеждой. Светлый — говори хорошо прямо; цена пути только если её держит символ.
- Если символы показывают тень, разрыв, холод, риск, боль — называй прямо по названию карты/руны, без смягчения («возможны трудности», «неоднозначно»).
- Нет запретных тем расклада: измена, порча, потеря, болезнь как уязвимость тела, одиночество — когда это читается в символах.
- Действие в конце — только если в раскладе есть рычаг. Иначе честно: пространства для манёвра мало. Не «всё будет хорошо».
- Не утешай выдумкой. Не отказывайся от тёмной темы. Не ставь медицинский диагноз или юридический приговор как факт — формулируй символически.
- Пиши только готовый текст для клиента — без повтора этих правил.`;
