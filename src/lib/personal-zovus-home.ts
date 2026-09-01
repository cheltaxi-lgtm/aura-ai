/**
 * Personal Zovus (auth home) — pure content + continue selection.
 * Server/session ownership stays outside; this only filters empty/broken CTAs.
 */

export const PERSONAL_ZOVUS_EXPLORE = [
  {
    id: "matrix",
    title: "Матрица",
    href: "/numerology/destiny-matrix",
    kind: "link" as const,
  },
  {
    id: "natal",
    title: "Натальная карта",
    href: "/natalnaya-karta",
    kind: "link" as const,
  },
  {
    id: "hd",
    title: "Дизайн человека",
    href: "/dizayn-cheloveka/rasschitat",
    kind: "link" as const,
  },
  {
    id: "tarot",
    title: "Таро",
    href: null,
    kind: "action" as const,
  },
  {
    id: "aura",
    title: "Аура по фото",
    href: "/aura",
    kind: "link" as const,
  },
  {
    id: "palm",
    title: "Гадание по ладони",
    href: "/gadanie-po-ladoni",
    kind: "link" as const,
  },
  {
    id: "matrix_pair",
    title: "Совместимость матриц",
    href: "/numerology/matrica-sovmestimosti",
    kind: "link" as const,
  },
] as const;

export type PersonalContinueKind = "tarot" | "matrix" | "natal" | "hd";

export type PersonalContinueItem = {
  kind: PersonalContinueKind;
  title: string;
  subtitle: string;
  /** Internal path when navigation is a plain link. */
  href?: string;
};

/**
 * Build compact Continue rows. Omit empty / not-owned / hidden recaps.
 * Caller must pass tarot only when home-recap is visible (not hidden).
 */
export function buildPersonalContinueItems(input: {
  tarotMasterName?: string | null;
  matrixOwned?: boolean;
  natalChartReady?: boolean;
  hdChartId?: string | null;
}): PersonalContinueItem[] {
  const items: PersonalContinueItem[] = [];

  const master = input.tarotMasterName?.trim();
  if (master) {
    items.push({
      kind: "tarot",
      title: "Расклад Таро",
      subtitle: `Продолжить с ${master}`,
    });
  }

  if (input.matrixOwned) {
    items.push({
      kind: "matrix",
      title: "Матрица судьбы",
      subtitle: "Открыть сохранённый разбор",
      href: "/?numerolog=1&tool=destiny_matrix",
    });
  }

  if (input.natalChartReady) {
    items.push({
      kind: "natal",
      title: "Натальная карта",
      subtitle: "Открыть вашу карту",
      href: "/cabinet/astrology",
    });
  }

  const hdId = input.hdChartId?.trim();
  if (hdId) {
    items.push({
      kind: "hd",
      title: "Дизайн человека",
      subtitle: "Открыть бодиграф",
      href: `/cabinet/human-design?chart=${encodeURIComponent(hdId)}`,
    });
  }

  return items;
}
