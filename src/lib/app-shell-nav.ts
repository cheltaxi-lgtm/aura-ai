import { primeHomeFlowStep } from "@/lib/home-flow-storage";
import { onboardingRedirectUrl } from "@/lib/post-auth-return";
import { getAppShellHomeNavHandlers } from "@/lib/app-shell-nav-bus";
import { pushAppShellRoute } from "@/lib/app-shell-router-bus";
import { isNativeCapacitorPlatform } from "@/lib/app-shell";

export const APP_SHELL_SECTIONS = {
  masters: "наставники",
  tariffs: "тарифы",
} as const;

export const OPEN_DECKS_MODAL_KEY = "zovus:openDecksModal";
export const OPEN_RITUAL_FLOW_KEY = "zovus:openRitualFlow";

export const APP_SHELL_HOME_EVENT = "zovus:app-shell-home-nav";

export const APP_SHELL_ROUTES = {
  home: "/?app=1&step=masters",
  cabinet: "/cabinet?app=1",
  rasklady: "/rasklady?app=1",
  photoReading: "/?photo=1&app=1",
} as const;

export function consumeOpenDecksModalFlag(): boolean {
  try {
    if (sessionStorage.getItem(OPEN_DECKS_MODAL_KEY) !== "1") return false;
    sessionStorage.removeItem(OPEN_DECKS_MODAL_KEY);
    return true;
  } catch {
    return false;
  }
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

function primeHomeFlowState(): void {
  try {
    primeHomeFlowStep();
  } catch {
    /* private mode */
  }
}

function isOnHomePage(): boolean {
  return typeof window !== "undefined" && window.location.pathname === "/";
}

function persistAppShellFlag(): void {
  try {
    sessionStorage.setItem("zovus_app_shell", "1");
  } catch {
    /* private mode */
  }
}

/** Full page navigation — native WebView only; web app shell uses client router when available. */
function shellNavigate(url: string): void {
  const absoluteUrl = new URL(url, window.location.origin);
  const path = `${absoluteUrl.pathname}${absoluteUrl.search}${absoluteUrl.hash}`;

  if (!isNativeCapacitorPlatform() && pushAppShellRoute(path)) {
    return;
  }

  window.location.assign(absoluteUrl.toString());
}

/** Birth-date onboarding after minimal registration (no server profile yet). */
export function navigateToBirthProfileOnboarding(): void {
  try {
    primeHomeFlowStep();
  } catch {
    /* private mode */
  }
  shellNavigate(onboardingRedirectUrl());
}

/** Переход к секции главной с любой страницы. */
export function navigateToAppSection(sectionId: string): void {
  primeHomeFlowState();
  const homeHandlers = getAppShellHomeNavHandlers();
  if (isOnHomePage() && homeHandlers.scrollToSection) {
    homeHandlers.scrollToSection(sectionId);
    return;
  }
  shellNavigate(`/?app=1#${encodeURIComponent(sectionId)}`);
}

export function navigateToAppHome(): void {
  primeHomeFlowState();
  persistAppShellFlag();
  if (isOnHomePage()) {
    window.history.replaceState(null, "", APP_SHELL_ROUTES.home);
    const homeHandlers = getAppShellHomeNavHandlers();
    if (homeHandlers.goHome) {
      homeHandlers.goHome();
    } else {
      window.dispatchEvent(new CustomEvent(APP_SHELL_HOME_EVENT));
    }
    return;
  }
  shellNavigate(APP_SHELL_ROUTES.home);
}

/** @deprecated alias */
export function navigateToHomeSpreadFlow(): void {
  navigateToAppHome();
}

/** Каталог раскладов. */
export function navigateToSpreadCatalog(): void {
  persistAppShellFlag();
  shellNavigate(APP_SHELL_ROUTES.rasklady);
}

/** Фото-расклад с любой страницы. */
export function navigateToPhotoReading(): void {
  primeHomeFlowState();
  persistAppShellFlag();
  const homeHandlers = getAppShellHomeNavHandlers();
  if (isOnHomePage() && homeHandlers.openPhotoReading) {
    homeHandlers.openPhotoReading();
    return;
  }
  shellNavigate(APP_SHELL_ROUTES.photoReading);
}

/** Модалка колод — флаг в sessionStorage, затем главная. */
export function navigateToDecksModal(): void {
  primeHomeFlowState();
  persistAppShellFlag();
  const homeHandlers = getAppShellHomeNavHandlers();
  if (isOnHomePage() && homeHandlers.openDecksModal) {
    homeHandlers.openDecksModal();
    return;
  }
  try {
    sessionStorage.setItem(OPEN_DECKS_MODAL_KEY, "1");
  } catch {
    /* private mode */
  }
  shellNavigate(APP_SHELL_ROUTES.home);
}

/** Кабинет — явная навигация с сохранением app-shell в WebView. */
export function navigateToCabinet(): void {
  persistAppShellFlag();
  shellNavigate(APP_SHELL_ROUTES.cabinet);
}

/** Обряд с любой страницы — флаг в sessionStorage, затем главная. */
export function navigateToRitualFlow(): void {
  primeHomeFlowState();
  persistAppShellFlag();
  const homeHandlers = getAppShellHomeNavHandlers();
  if (isOnHomePage() && homeHandlers.openRitualFlow) {
    homeHandlers.openRitualFlow();
    return;
  }
  try {
    sessionStorage.setItem(OPEN_RITUAL_FLOW_KEY, "1");
  } catch {
    /* private mode */
  }
  shellNavigate(APP_SHELL_ROUTES.home);
}
