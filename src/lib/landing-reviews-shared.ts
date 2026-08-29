export const LANDING_REVIEW_PRODUCTS = [
  "tarot",
  "matrix",
  "natal",
  "hd",
  "photo",
  "general",
] as const;

export type LandingReviewProduct = (typeof LANDING_REVIEW_PRODUCTS)[number];

export const LANDING_REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export type LandingReviewStatus = (typeof LANDING_REVIEW_STATUSES)[number];

export const LANDING_REVIEW_PRODUCT_LABELS: Record<LandingReviewProduct, string> = {
  tarot: "Таро",
  matrix: "Матрица судьбы",
  natal: "Натальная карта",
  hd: "Дизайн человека",
  photo: "ФотоТаро",
  general: "Zovus",
};

export const LANDING_REVIEW_STATUS_LABELS: Record<LandingReviewStatus, string> = {
  pending: "На модерации",
  approved: "Опубликован",
  rejected: "Отклонён",
};

export type PublicLandingReview = {
  id: string;
  rating: number;
  authorName: string;
  city: string | null;
  product: LandingReviewProduct;
  body: string;
  publishedAt: string;
};

export const LANDING_REVIEW_PAGE_SIZE = 8;
export const LANDING_REVIEW_BODY_MIN = 24;
export const LANDING_REVIEW_BODY_MAX = 480;
export const LANDING_REVIEW_NAME_MAX = 40;

export function isLandingReviewProduct(value: string): value is LandingReviewProduct {
  return (LANDING_REVIEW_PRODUCTS as readonly string[]).includes(value);
}

export function isLandingReviewStatus(value: string): value is LandingReviewStatus {
  return (LANDING_REVIEW_STATUSES as readonly string[]).includes(value);
}

export function formatLandingReviewWhen(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = now.getTime() - date.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 1) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 7) return `${days} дн. назад`;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Moscow",
  }).format(date);
}
