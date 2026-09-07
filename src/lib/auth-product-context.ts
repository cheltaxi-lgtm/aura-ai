export type AuthProduct = "photo" | "hd" | "natal" | "matrix" | "aura" | "palm" | "tarot" | "generic";

export type AuthProductCopy = {
  product: AuthProduct;
  title: string;
  subtitle: string;
};

export function resolveAuthProduct(returnTo: string): AuthProduct {
  const value = returnTo.toLowerCase();
  if (value.includes("photo=1") || value.includes("photo-rasklad")) return "photo";
  if (value.includes("dizayn-cheloveka") || value.includes("human-design")) return "hd";
  if (value.includes("natalnaya-karta") || value.includes("astrology")) return "natal";
  if (value.includes("numerology") || value.includes("matritsa")) return "matrix";
  if (value.includes("gadanie-po-ladoni") || value.includes("palm")) return "palm";
  if (value.includes("/aura")) return "aura";
  if (value.includes("spread") || value.includes("rasklad")) return "tarot";
  return "generic";
}

export function authProductCopy(returnTo: string, guestTarotResume = false): AuthProductCopy {
  const detected = resolveAuthProduct(returnTo);
  const product = guestTarotResume && (detected === "generic" || detected === "tarot") ? "tarot" : detected;
  const copy: Record<AuthProduct, Omit<AuthProductCopy, "product">> = {
    photo: { title: "Карты уже выбраны", subtitle: "Создайте аккаунт — расклад и вопрос восстановятся, а полный разбор откроется с того же места." },
    hd: { title: "Сохраните бодиграф", subtitle: "После регистрации карта останется в архиве, и вы сможете открыть полный персональный разбор." },
    natal: { title: "Сохраните натальную карту", subtitle: "Расчёт останется в кабинете, а полная трактовка продолжится с того же места." },
    matrix: { title: "Сохраните Матрицу судьбы", subtitle: "Числа и схема не изменятся после регистрации — откроется персональная интерпретация." },
    aura: { title: "Сохраните снимок ауры", subtitle: "Краткий результат останется в кабинете, а полный разбор продолжится после регистрации." },
    palm: { title: "Сохраните снимок ладони", subtitle: "Краткий результат останется в кабинете, а полный разбор линий откроется после регистрации." },
    tarot: { title: guestTarotResume ? "Откройте полный разбор этих карт" : "Сохраните свой расклад", subtitle: guestTarotResume ? "Ваш вопрос и три карты уже сохранены — пересчёта не будет." : "Ваши результаты и продолжение диалога — в одном аккаунте." },
    generic: { title: "Создайте личный кабинет", subtitle: "Все расчёты, отчёты и продолжение диалогов будут храниться в одном месте." },
  };
  return { product, ...copy[product] };
}
