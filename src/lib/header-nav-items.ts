import type { LucideIcon } from "lucide-react";
import {
  Camera,
  Download,
  Flame,
  HeartHandshake,
  Hexagon,
  Layers,
  LayoutGrid,
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
};

/** Grouped header navigation — shared by desktop dropdown and mobile sheet. */
export function buildHeaderNavSections(
  callbacks: HeaderNavCallbacks,
  options: BuildHeaderNavOptions = {}
): HeaderNavSection[] {
  const { isLoggedIn = false } = options;
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
        ...(isLoggedIn
          ? [
              {
                id: "joint",
                label: "Совместный расклад",
                icon: Users,
                onClick: navigateToJointReading,
              } satisfies HeaderNavItem,
            ]
          : []),
        {
          id: "photo",
          label: callbacks.photoNavLabel,
          icon: Camera,
          onClick: callbacks.onNavPhoto,
        },
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
        {
          id: "ritual",
          label: "Обряд",
          icon: Flame,
          onClick: callbacks.onNavRitual,
        },
        {
          id: "destiny-matrix",
          label: "Матрица судьбы",
          icon: Hexagon,
          onClick: navigateToDestinyMatrix,
        },
        {
          id: "natal-chart",
          label: "Натальная карта",
          icon: Star,
          onClick: navigateToNatalChart,
        },
        {
          id: "human-design",
          label: "Дизайн Человека",
          icon: Sun,
          onClick: navigateToHumanDesign,
        },
        {
          id: "natal-compatibility",
          label: "Натальная совместимость",
          icon: HeartHandshake,
          onClick: navigateToNatalCompatibility,
        },
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
