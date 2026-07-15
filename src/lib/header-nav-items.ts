import type { LucideIcon } from "lucide-react";
import {
  Camera,
  Download,
  Flame,
  HeartHandshake,
  Layers,
  LayoutGrid,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { shouldUseAppShellClient } from "@/lib/app-shell";
import { navigateToSpreadCatalog } from "@/lib/app-shell-nav";

const APK_URL =
  process.env.NEXT_PUBLIC_ANDROID_APK_URL?.trim() || "/releases/zovus-latest.apk";

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

/** Grouped header navigation — shared by desktop dropdown and mobile sheet. */
export function buildHeaderNavSections(callbacks: HeaderNavCallbacks): HeaderNavSection[] {
  const inAppShell = typeof window !== "undefined" && shouldUseAppShellClient();

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
        {
          id: "joint",
          label: "Совместный расклад",
          icon: Users,
          href: inAppShell ? "/joint-reading?app=1" : "/joint-reading",
        },
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
          id: "natal-chart",
          label: "Натальная карта",
          icon: Star,
          href: inAppShell ? "/cabinet/astrology?app=1" : "/cabinet/astrology",
        },
        {
          id: "natal-compatibility",
          label: "Натальная совместимость",
          icon: HeartHandshake,
          href: inAppShell
            ? "/cabinet/astrology?tab=compatibility&app=1"
            : "/cabinet/astrology?tab=compatibility",
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
        ...(inAppShell
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
