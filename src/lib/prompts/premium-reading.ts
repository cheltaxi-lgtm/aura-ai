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
}

/** Token budget for a paid full spread — scales with card count. */
export function paidSpreadMaxTokens(cardCount: number): number {
  const n = Math.max(1, cardCount);
  return Math.min(5000, Math.max(2800, 1800 + n * 350));
}

/**
 * Depth + honesty overlay for an already-paid full reading.
 * Does not include persona — layer this on top of character/human prompts.
 */
export function buildPaidSpreadReadingExtras(opts: PaidSpreadReadingExtrasOpts): string {
  const n = Math.max(1, opts.cardCount);
  const tarotRune = isTarotRuneMasterId(opts.masterId ?? "");
  const depth = tarotRune ? tarotRuneThematicReadingRules(n) : thematicSpreadReadingRules(n);
  const includeFinal =
    opts.includeFinalConclusion ?? !tarotRune;

  return [
    CARD_GROUNDED_READING_RULES,
    depth,
    includeFinal ? spreadFinalConclusionRules(n) : "",
    PREMIUM_PAID_READING_HONESTY,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Honesty addendum for paid spreads — name darkness, then one agency line. */
export const PREMIUM_PAID_READING_HONESTY = `
ЧЕСТНОСТЬ ОПЛАЧЕННОГО РАСКЛАДА (обязательно):
- Если символы показывают тень, разрыв, холод, риск, боль — называй прямо по названию карты/руны, без смягчения («возможны трудности», «неоднозначно»).
- Нет запретных тем расклада: измена, порча, потеря, болезнь как уязвимость тела, одиночество — когда это читается в символах.
- После честного разбора тени — ровно одна короткая фраза про выбор или действие (агентность). Это НЕ замена негатива позитивом и НЕ «всё будет хорошо».
- Не утешай выдумкой. Не отказывайся от тёмной темы. Не ставь медицинский диагноз или юридический приговор как факт — формулируй символически.
- Пиши только готовый текст для клиента — без повтора этих правил.`;
