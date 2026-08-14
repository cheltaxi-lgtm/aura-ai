import { PRICING } from "@/lib/config/pricing";
import { DEFAULT_RUNE_COSTS } from "@/lib/rune-costs";
import type { ProductFunnelProduct } from "@/lib/seo/product-funnel";

/**
 * P2.5: one existing paid next step after each free public result.
 * Costs come from the live pricing tables — never invent a product or price.
 */
export type FreeToPaidId = "matrix" | "matrix_pair" | "natal" | "human_design";

export type FreeToPaidStep = {
  id: FreeToPaidId;
  product: ProductFunnelProduct;
  runeAction:
    | "NUMEROLOGY_SESSION"
    | "MATRIX_PAIR_REPORT"
    | "NATAL_READING"
    | "HD_REPORT";
  cost: number;
  buyLabel: string;
  openLabel: string;
  buyHint: string;
  openHint: string;
};

export const FREE_TO_PAID: Record<FreeToPaidId, FreeToPaidStep> = {
  matrix: {
    id: "matrix",
    product: "matrix",
    runeAction: "NUMEROLOGY_SESSION",
    cost: PRICING.NUMEROLOGY_SESSION,
    buyLabel: "Получить полный разбор Матрицы",
    openLabel: "Открыть полный разбор",
    buyHint: `К бесплатным цифрам добавится разбор Эвелины с сохранением и ${PRICING.MATRIX_INCLUDED_QUESTIONS} вопросами в чате.`,
    openHint: "Разбор уже куплен — откроется сохранённый текст без повторной оплаты.",
  },
  matrix_pair: {
    id: "matrix_pair",
    product: "matrix_compatibility",
    runeAction: "MATRIX_PAIR_REPORT",
    cost: PRICING.MATRIX_PAIR_REPORT,
    buyLabel: "Разобрать отношения подробно",
    openLabel: "Открыть полный разбор",
    buyHint: "К score и акцентам добавятся практика по ключам, совет на 30 дней и диалог с Эвелиной.",
    openHint: "Разбор этой пары уже куплен — откроется сохранённый текст без повторной оплаты.",
  },
  natal: {
    id: "natal",
    product: "natal",
    runeAction: "NATAL_READING",
    cost: DEFAULT_RUNE_COSTS.NATAL_READING,
    buyLabel: "Получить полный разбор натальной карты",
    openLabel: "Открыть полный разбор",
    buyHint: "К схеме и акцентам добавится полная трактовка выбранной традиции — западной или ведической.",
    openHint: "Трактовка уже куплена — откроется сохранённый разбор в кабинете.",
  },
  human_design: {
    id: "human_design",
    product: "human_design",
    runeAction: "HD_REPORT",
    cost: DEFAULT_RUNE_COSTS.HD_REPORT,
    buyLabel: "Получить полный разбор Дизайна человека",
    openLabel: "Открыть полный разбор",
    buyHint: "К типу и стратегии добавится полный текст Эвелины с практиками и вопросами.",
    openHint: "Разбор уже куплен — откроется сохранённый текст без повторной оплаты.",
  },
};

export function freeToPaidCtaLabel(step: FreeToPaidStep, owned: boolean): string {
  return owned ? step.openLabel : step.buyLabel;
}

export function freeToPaidHint(step: FreeToPaidStep, owned: boolean): string {
  return owned ? step.openHint : step.buyHint;
}

export function freeToPaidFunnelState(owned: boolean): "owned" | "new" {
  return owned ? "owned" : "new";
}
