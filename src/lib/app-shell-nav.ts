import { FLOW_STEP_KEY } from "@/lib/home-flow-storage";

export const APP_SHELL_SECTIONS = {
  masters: "наставники",
  tariffs: "тарифы",
} as const;

export const OPEN_DECKS_MODAL_KEY = "zovus:openDecksModal";

function primeHomeFlowState(): void {
  try {
    localStorage.setItem(FLOW_STEP_KEY, "masters");
  } catch {
    /* private mode */
  }
}

/** Переход к секции главной с любой страницы (кабинет, чат по deep link и т.д.). */
export function navigateToAppSection(sectionId: string): void {
  primeHomeFlowState();
  window.location.assign(`/#${encodeURIComponent(sectionId)}`);
}

/** Новый расклад — сброс SPA-состояния и переход на главную. */
export function navigateToHomeSpreadFlow(): void {
  primeHomeFlowState();
  window.location.assign("/");
}

/** Фото-расклад с любой страницы. */
export function navigateToPhotoReading(): void {
  primeHomeFlowState();
  window.location.assign("/?photo=1");
}

/** Модалка колод — флаг в sessionStorage, затем главная. */
export function navigateToDecksModal(): void {
  primeHomeFlowState();
  try {
    sessionStorage.setItem(OPEN_DECKS_MODAL_KEY, "1");
  } catch {
    /* private mode */
  }
  window.location.assign("/");
}

export function consumeOpenDecksModalFlag(): boolean {
  try {
    if (sessionStorage.getItem(OPEN_DECKS_MODAL_KEY) !== "1") return false;
    sessionStorage.removeItem(OPEN_DECKS_MODAL_KEY);
    return true;
  } catch {
    return false;
  }
}
