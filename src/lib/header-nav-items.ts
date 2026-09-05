import type { LucideIcon } from "lucide-react";
import {
  Camera,
  Download,
  Flame,
  HeartHandshake,
  Hexagon,
  Layers,
  LayoutGrid,
  Hand,
  Sparkle,
  Sparkles,
  Star,
  Sun,
  Users,
} from "lucide-react";
import { isAppShellSearchParam, isNativeCapacitorPlatform } from "@/lib/app-shell";
import {
  navigateToJointReading,
  navigateToNatalChart,
  navigateToNatalCompatibility,
  navigateToSpreadCatalog,
} from "@/lib/app-shell-nav";

function navigateToDestinyMatrix() {
  if (typeof window === "undefined") return;
  window.location.assign("/numerology/destiny-matrix");
}

function navigateToHumanDesign() {
  if (typeof window === "undefined") return;
  window.location.assign("/dizayn-cheloveka");
}

const APK_URL =
  process.env.NEXT_PUBLIC_ANDROID_APK_URL?.trim() || "/releases/zovus-latest.apk";

function resolveAppRouteLinks(): boolean {
  if (typeof window === "undefined") return false;
  return isNativeCapacitorPlatform() || isAppShellSearchParam(window.location.search);
}

export type HeaderNavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  href?: string;
  download?: boolean;
};

export type HeaderNavSection = {
  id: string;
  title: string;
  items: HeaderNavItem[];
};

export type HeaderNavCallbacks = {
  photoNavLabel: string;
  onNavPhoto: () => void;
  onNavMasters: () => void;
  onNavDecks: () => void;
  onNavTariffs: () => void;
  onNavRitual: () => void;
  onStartReading: () => void;
};

export type BuildHeaderNavOptions = {
  isLoggedIn?: boolean;
  /** Kill-switches from /api/platform/features. */
  humanDesignEnabled?: boolean;
  natalChartEnabled?: boolean;
  jointReadingEnabled?: boolean;
  ritualsEnabled?: boolean;
  photoReadingEnabled?: boolean;
  auraReadingEnabled?: boolean;
  palmReadingEnabled?: boolean;
};

/** Grouped header navigation — shared by desktop dropdown and mobile sheet. */
export function buildHeaderNavSections(
  callbacks: HeaderNavCallbacks,
  options: BuildHeaderNavOptions = {}
): HeaderNavSection[] {
  const {
    isLoggedIn = false,
    humanDesignEnabled = true,
    natalChartEnabled = true,
    jointReadingEnabled = true,
    ritualsEnabled = true,
    photoReadingEnabled = true,
    auraReadingEnabled = false,
    palmReadingEnabled = false,
  } = options;
  const appRoutes = resolveAppRouteLinks();

  const sections: HeaderNavSection[] = [
    {
      id: "readings",
      title: "Расклады",
      items: [
        {
          id: "spread-catalog",
          label: "Каталог раскладов",
          icon: LayoutGrid,
          onClick: navigateToSpreadCatalog,
        },
        {
          id: "reading",
          label: "Получить расклад",
          icon: Sparkles,
          onClick: callbacks.onStartReading,
        },
        ...(isLoggedIn && jointReadingEnabled
          ? [
              {
                id: "joint",
                label: "Совместный расклад",
                icon: Users,
                onClick: navigateToJointReading,
              } satisfies HeaderNavItem,
            ]
          : []),
        ...(photoReadingEnabled
          ? [
              {
                id: "photo",
                label: "Расклад Таро по фото",
                icon: Camera,
                onClick: callbacks.onNavPhoto,
              } satisfies HeaderNavItem,
            ]
          : []),
        ...(auraReadingEnabled
          ? [
              {
                id: "aura",
                label: "Аура по фото",
                icon: Sparkle,
                href: "/aura",
              } satisfies HeaderNavItem,
            ]
          : []),
        ...(palmReadingEnabled
          ? [
              {
                id: "palm",
                label: "Гадание по ладони",
                icon: Hand,
                href: "/gadanie-po-ladoni",
              } satisfies HeaderNavItem,
            ]
          : []),
      ],
    },
    {
      id: "service",
      title: "Сервис",
      items: [
        {
          id: "masters",
          label: "Мастера",
          icon: Sparkles,
          onClick: callbacks.onNavMasters,
        },
        {
          id: "decks",
          label: "Колоды",
          icon: Layers,
          onClick: callbacks.onNavDecks,
        },
        ...(ritualsEnabled
          ? [
              {
                id: "ritual",
                label: "Обряд",
                icon: Flame,
                onClick: callbacks.onNavRitual,
              } satisfies HeaderNavItem,
            ]
          : []),
        {
          id: "destiny-matrix",
          label: "Матрица судьбы",
          icon: Hexagon,
          onClick: navigateToDestinyMatrix,
        },
        ...(natalChartEnabled
          ? [
              {
                id: "natal-chart",
                label: "Натальная карта",
                icon: Star,
                onClick: navigateToNatalChart,
              } satisfies HeaderNavItem,
            ]
          : []),
        ...(humanDesignEnabled
          ? [
              {
                id: "human-design",
                label: "Дизайн Человека",
                icon: Sun,
                onClick: navigateToHumanDesign,
              } satisfies HeaderNavItem,
            ]
          : []),
        ...(natalChartEnabled
          ? [
              {
                id: "natal-compatibility",
                label: "Натальная совместимость",
                icon: HeartHandshake,
                onClick: navigateToNatalCompatibility,
              } satisfies HeaderNavItem,
            ]
          : []),
      ],
    },
    {
      id: "more",
      title: "Ещё",
      items: [
        {
          id: "tariffs",
          label: "Тарифы",
          icon: LayoutGrid,
          onClick: callbacks.onNavTariffs,
        },
        ...(appRoutes
          ? []
          : [
              {
                id: "download",
                label: "Скачать приложение",
                icon: Download,
                href: APK_URL,
                download: true,
              } satisfies HeaderNavItem,
            ]),
      ],
    },
  ];

  return sections;
}
