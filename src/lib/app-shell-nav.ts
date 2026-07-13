import { persistStep, primeHomeFlowStep } from "@/lib/home-flow-storage";
import { onboardingRedirectUrl } from "@/lib/post-auth-return";

export const APP_SHELL_SECTIONS = {
  masters: "наставники",
  tariffs: "тарифы",
} as const;

export const OPEN_DECKS_MODAL_KEY = "zovus:openDecksModal";
export const OPEN_RITUAL_FLOW_KEY = "zovus:openRitualFlow";

function primeHomeFlowState(): void {
  try {
    primeHomeFlowStep();
  } catch {
    /* private mode */
  }
}

/** Birth-date onboarding after minimal registration (no server profile yet). */
export function navigateToBirthProfileOnboarding(): void {
  try {
    persistStep("onboarding");
  } catch {
    /* private mode */
  }
  window.location.assign(onboardingRedirectUrl());
}

/** Переход к секции главной с любой страницы (кабинет, чат по deep link и т.д.). */
export function navigateToAppSection(sectionId: string): void {
  primeHomeFlowState();
  window.location.assign(`/#${encodeURIComponent(sectionId)}`);
}

/** Главная — сброс SPA-состояния и переход на домашний экран. */
export const APP_SHELL_HOME_EVENT = "zovus:app-shell-home-nav";

export function navigateToAppHome(): void {
  primeHomeFlowState();
  if (typeof window !== "undefined" && window.location.pathname === "/") {
    try {
      sessionStorage.setItem("zovus_app_shell", "1");
    } catch {
      /* private mode */
    }
    window.history.replaceState(null, "", "/?app=1&step=masters");
    window.dispatchEvent(new CustomEvent(APP_SHELL_HOME_EVENT));
    return;
  }
  window.location.assign("/?app=1&step=masters");
}

/** @deprecated alias */
export function navigateToHomeSpreadFlow(): void {
  navigateToAppHome();
}

/** Каталог раскладов. */
export function navigateToSpreadCatalog(): void {
  try {
    sessionStorage.setItem("zovus_app_shell", "1");
  } catch {
    /* private mode */
  }
  window.location.assign("/rasklady?app=1");
}

/** Фото-расклад с любой страницы. */
export function navigateToPhotoReading(): void {
  primeHomeFlowState();
  window.location.assign("/?photo=1&app=1");
}

/** Модалка колод — флаг в sessionStorage, затем главная. */
export function navigateToDecksModal(): void {
  primeHomeFlowState();
  try {
    sessionStorage.setItem(OPEN_DECKS_MODAL_KEY, "1");
  } catch {
    /* private mode */
  }
  window.location.assign("/?app=1&step=masters");
}

/** Кабинет — явная навигация с сохранением app-shell в WebView. */
export function navigateToCabinet(): void {
  try {
    sessionStorage.setItem("zovus_app_shell", "1");
  } catch {
    /* private mode */
  }
  markAppShellInDocument();
  window.location.href = "/cabinet?app=1";
}

function markAppShellInDocument(): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.appShell = "android";
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

/** Обряд с любой страницы (кабинет, сеанс и т.д.) — флаг в sessionStorage, затем главная. */
export function navigateToRitualFlow(): void {
  primeHomeFlowState();
  try {
    sessionStorage.setItem(OPEN_RITUAL_FLOW_KEY, "1");
  } catch {
    /* private mode */
  }
  window.location.assign("/?app=1&step=masters");
}

export function consumeOpenRitualFlowFlag(): boolean {
  try {
    if (sessionStorage.getItem(OPEN_RITUAL_FLOW_KEY) !== "1") return false;
    sessionStorage.removeItem(OPEN_RITUAL_FLOW_KEY);
    return true;
  } catch {
    return false;
  }
}
