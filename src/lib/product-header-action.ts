export type ProductHeaderAction = {
  desktopLabel: string;
  mobileLabel: string;
  target: string | null;
};

const PRODUCT_ACTIONS: Array<[prefix: string, action: ProductHeaderAction]> = [
  ["/photo-rasklad", { desktopLabel: "Загрузить расклад", mobileLabel: "Фото", target: "/?photo=1" }],
  ["/gadanie-po-ladoni", { desktopLabel: "Снять ладонь", mobileLabel: "Ладонь", target: "#palm-calculator" }],
  ["/dizayn-cheloveka/rasschitat", { desktopLabel: "Рассчитать бодиграф", mobileLabel: "Бодиграф", target: "#hd-calculator" }],
  ["/dizayn-cheloveka", { desktopLabel: "Рассчитать бодиграф", mobileLabel: "Бодиграф", target: "/dizayn-cheloveka/rasschitat#hd-calculator" }],
  ["/natalnaya-karta", { desktopLabel: "Рассчитать натальную карту", mobileLabel: "Карта", target: "#natal-calculator" }],
  ["/cabinet/astrology", { desktopLabel: "Моя натальная карта", mobileLabel: "Моя карта", target: null }],
  ["/numerology/destiny-matrix", { desktopLabel: "Рассчитать матрицу", mobileLabel: "Матрица", target: "#calculate" }],
  ["/numerology/matrica-sovmestimosti", { desktopLabel: "Рассчитать совместимость", mobileLabel: "Пара", target: "#calculate" }],
  ["/numerology", { desktopLabel: "Начать с Эвелиной", mobileLabel: "Начать", target: "/?numerolog=1" }],
  ["/matritsa", { desktopLabel: "Рассчитать матрицу", mobileLabel: "Матрица", target: "/numerology/destiny-matrix#calculate" }],
  ["/aura", { desktopLabel: "Снять ауру", mobileLabel: "Аура", target: "#aura-calculator" }],
  ["/taro", { desktopLabel: "Начать расклад", mobileLabel: "Расклад", target: "/?ask=1&spread=1" }],
];

export function resolveProductHeaderAction(pathname: string | null): ProductHeaderAction | null {
  if (!pathname || pathname === "/") return null;
  const match = PRODUCT_ACTIONS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!match) return null;
  const [prefix, action] = match;
  if (pathname !== prefix && action.target?.startsWith("#")) {
    return { ...action, target: `${prefix}${action.target}` };
  }
  return action;
}
