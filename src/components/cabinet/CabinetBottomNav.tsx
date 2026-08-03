"use client";

import {
  UserRound,
  ScrollText,
  Flame,
  BookOpen,
  Brain,
  Coins,
  type LucideIcon,
} from "lucide-react";

export type CabinetTab = "profile" | "history" | "diary" | "memory" | "runes" | "rituals";

interface Props {
  active: CabinetTab;
  onTab: (tab: CabinetTab) => void;
  showRituals?: boolean;
  ritualPendingReview?: number;
  ritualAttentionCount?: number;
}

const BASE_TABS: {
  id: CabinetTab;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "profile", label: "Профиль", icon: UserRound },
  { id: "history", label: "История", icon: ScrollText },
  { id: "rituals", label: "Обряды", icon: Flame },
  { id: "diary", label: "Дневник", icon: BookOpen },
  { id: "memory", label: "Память", icon: Brain },
  { id: "runes", label: "Руны", icon: Coins },
];

function ritualBadge(pending: number, attention: number): string | null {
  if (pending > 0) return String(pending);
  if (attention > 0) return String(attention);
  return null;
}

export default function CabinetBottomNav({
  active,
  onTab,
  showRituals = true,
  ritualPendingReview = 0,
  ritualAttentionCount = 0,
}: Props) {
  const tabs = showRituals
    ? BASE_TABS
    : BASE_TABS.filter((t) => t.id !== "rituals");

  return (
    <nav
      className="cabinet-bottom-nav fixed bottom-[var(--cookie-banner-offset,0px)] left-0 right-0 z-40 border-t border-white/10 bg-black/85 backdrop-blur-xl"
      aria-label="Навигация кабинета"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
      <div className="mx-auto flex max-w-3xl px-1 pb-[env(safe-area-inset-bottom,0px)]">
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          const Icon = tab.icon;
          const badge =
            tab.id === "rituals"
              ? ritualBadge(ritualPendingReview, ritualAttentionCount)
              : null;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTab(tab.id)}
              className={`relative flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 px-1 pt-2 transition-colors ${
                isActive ? "text-amber-300" : "text-white/45 hover:text-white/75"
              }`}
            >
              {isActive ? (
                <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600 shadow-[0_0_12px_rgba(251,191,36,0.45)]" />
              ) : null}
              <span className="relative">
                <Icon
                  className={`cabinet-bottom-nav__icon transition-transform ${isActive ? "scale-110" : ""}`}
                  strokeWidth={isActive ? 2.25 : 1.75}
                  aria-hidden
                />
                {badge ? (
                  <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-black">
                    {badge}
                  </span>
                ) : null}
              </span>
              <span className={`text-[10px] font-medium leading-none sm:text-[11px] ${isActive ? "text-amber-200/95" : ""}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
