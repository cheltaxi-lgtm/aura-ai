import { primeHomeFlowStep } from "@/lib/home-flow-storage";
import { onboardingRedirectUrl } from "@/lib/post-auth-return";
import { getAppShellHomeNavHandlers } from "@/lib/app-shell-nav-bus";
import { pushAppShellRoute } from "@/lib/app-shell-router-bus";
import {
  appShellNavigationOrigin,
  isAppShellSearchParam,
  isNativeCapacitorPlatform,
  shouldUseAppShellClient,
} from "@/lib/app-shell";
import { navigateViaSessionBridge, shouldUseSessionBridge } from "@/lib/session-bridge";

export const APP_SHELL_SECTIONS = {
  masters: "наставники",
  tariffs: "тарифы",
} as const;

export const OPEN_DECKS_MODAL_KEY = "zovus:openDecksModal";
export const OPEN_RITUAL_FLOW_KEY = "zovus:openRitualFlow";
/** Optional ritual type to auto-start after auth (SEO deep link / guest create 401). */
export const OPEN_RITUAL_TYPE_KEY = "zovus:openRitualType";

export const APP_SHELL_HOME_EVENT = "zovus:app-shell-home-nav";

export const APP_SHELL_ROUTES = {
  home: "/?app=1&step=masters",
  cabinet: "/cabinet?app=1",
  natalChart: "/cabinet/astrology?app=1",
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

export function persistOpenRitualIntent(ritualType?: string | null): void {
  try {
    sessionStorage.setItem(OPEN_RITUAL_FLOW_KEY, "1");
    if (ritualType) {
      sessionStorage.setItem(OPEN_RITUAL_TYPE_KEY, ritualType);
    } else {
      sessionStorage.removeItem(OPEN_RITUAL_TYPE_KEY);
    }
  } catch {
    /* private mode */
  }
}

export function consumeOpenRitualTypeFlag(): string | null {
  try {
    const value = sessionStorage.getItem(OPEN_RITUAL_TYPE_KEY);
    sessionStorage.removeItem(OPEN_RITUAL_TYPE_KEY);
    return value?.trim() || null;
  } catch {
    return null;
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

function shouldAttachAppQuery(): boolean {
  if (typeof window === "undefined") return false;
  return isNativeCapacitorPlatform() || isAppShellSearchParam(window.location.search);
}

function resolveAppAwarePath(path: string): string {
  if (!shouldAttachAppQuery()) return path;
  const absolute = new URL(path, appShellNavigationOrigin());
  absolute.searchParams.set("app", "1");
  return `${absolute.pathname}${absolute.search}${absolute.hash}`;
}

const HARD_NAV_PREFIXES = ["/cabinet", "/joint-reading", "/rasklady", "/auth", "/diary"] as const;

function requiresHardNavigation(pathname: string): boolean {
  return HARD_NAV_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function finishHardNavigate(absoluteUrl: URL, path: string): void {
  if (
    !requiresHardNavigation(absoluteUrl.pathname) &&
    shouldUseAppShellClient() &&
    !isNativeCapacitorPlatform() &&
    pushAppShellRoute(path)
  ) {
    return;
  }

  window.location.assign(absoluteUrl.toString());
}

/** Full page navigation — in-app home may soft-route; cabinet and deep links always hard-navigate. */
function shellNavigate(url: string): void {
  const absoluteUrl = new URL(url, appShellNavigationOrigin());
  const path = `${absoluteUrl.pathname}${absoluteUrl.search}${absoluteUrl.hash}`;

  // WebView: re-stamp aura_auth on the document response before protected hard-nav.
  if (
    shouldUseSessionBridge() &&
    requiresHardNavigation(absoluteUrl.pathname) &&
    !absoluteUrl.pathname.startsWith("/auth")
  ) {
    void navigateViaSessionBridge(path).then((bridged) => {
      if (!bridged) finishHardNavigate(absoluteUrl, path);
    });
    return;
  }

  finishHardNavigate(absoluteUrl, path);
}

/** Birth-date onboarding after minimal registration (no server profile yet). */
export function navigateToBirthProfileOnboarding(): void {
  try {
    primeHomeFlowStep();
  } catch {
    /* private mode */
  }
  const target = onboardingRedirectUrl();
  // Leaving /cabinet/* via bare location.assign drops aura_auth in WebView;
  // re-stamp the cookie through the session bridge first.
  if (shouldUseSessionBridge()) {
    void navigateViaSessionBridge(target).then((bridged) => {
      if (!bridged) shellNavigate(target);
    });
    return;
  }
  shellNavigate(target);
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

/** Header CTA «Получить расклад» — on home starts the flow; otherwise opens home. */
export function navigateToStartReading(): void {
  primeHomeFlowState();
  const homeHandlers = getAppShellHomeNavHandlers();
  if (isOnHomePage() && homeHandlers.startReading) {
    homeHandlers.startReading();
    return;
  }
  navigateToAppHome();
}

/** @deprecated alias — prefer navigateToStartReading for the header CTA */
export function navigateToHomeSpreadFlow(): void {
  navigateToStartReading();
}

/** Каталог раскладов. */
export function navigateToSpreadCatalog(): void {
  if (isNativeCapacitorPlatform() || isAppShellSearchParam(window.location.search)) {
    persistAppShellFlag();
  }
  shellNavigate(
    isNativeCapacitorPlatform() || isAppShellSearchParam(window.location.search)
      ? APP_SHELL_ROUTES.rasklady
      : "/rasklady"
  );
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

/** Совместный расклад — только для залогиненных. */
export function navigateToJointReading(): void {
  if (shouldAttachAppQuery()) persistAppShellFlag();
  shellNavigate(resolveAppAwarePath("/joint-reading"));
}

/** Натальная карта — из меню и промо-блоков. */
export function navigateToNatalChart(): void {
  if (shouldAttachAppQuery()) persistAppShellFlag();
  shellNavigate(resolveAppAwarePath("/cabinet/astrology"));
}

/** Натальная совместимость — вкладка compatibility в кабинете астрологии. */
export function navigateToNatalCompatibility(): void {
  if (shouldAttachAppQuery()) persistAppShellFlag();
  shellNavigate(resolveAppAwarePath("/cabinet/astrology?tab=compatibility"));
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
