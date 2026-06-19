import type { DeckSystem } from "@/lib/decks/types";
import { resolveMasterDeckSystem } from "@/lib/decks";

/** Canonical master avatar asset slots — drop final art as {id}.webp without code changes. */
export interface MasterAvatarSlot {
  id: string;
  /** Placeholder / fallback portrait (SVG). Replace with .webp at same base path when ready. */
  portrait: string;
  thumb: string;
  monogram: string;
  artDirection: string;
  moodFrom: string;
  moodTo: string;
  glow: string;
}

const AVATAR_BASE = "/masters/avatars";

export const MASTER_AVATAR_SLOTS: Record<string, MasterAvatarSlot> = {
  ragnar: {
    id: "ragnar",
    portrait: `${AVATAR_BASE}/ragnar.svg`,
    thumb: `${AVATAR_BASE}/ragnar-thumb.svg`,
    monogram: "R",
    artDirection:
      "Stern northern man, beard, furs, rune stones, aurora; cold steel-blue + gold. Drop-in: ragnar.webp (400×520 portrait).",
    moodFrom: "#1a2838",
    moodTo: "#3d5a73",
    glow: "rgba(148, 163, 184, 0.45)",
  },
  veronika: {
    id: "veronika",
    portrait: `${AVATAR_BASE}/veronika.svg`,
    thumb: `${AVATAR_BASE}/veronika-thumb.svg`,
    monogram: "V",
    artDirection:
      "Refined woman, soft gaze, tarot cards, warm light; wine + gold. Drop-in: veronika.webp.",
    moodFrom: "#2a1438",
    moodTo: "#5c2a52",
    glow: "rgba(168, 85, 247, 0.45)",
  },
  agafya: {
    id: "agafya",
    portrait: `${AVATAR_BASE}/agafya.svg`,
    thumb: `${AVATAR_BASE}/agafya-thumb.svg`,
    monogram: "А",
    artDirection:
      "Wise folk healer, headscarf, herbs, candles; earthy warm. Drop-in: agafya.webp.",
    moodFrom: "#1a2818",
    moodTo: "#3d4a2a",
    glow: "rgba(16, 185, 129, 0.4)",
  },
  "shri-raj": {
    id: "shri-raj",
    portrait: `${AVATAR_BASE}/shri-raj.svg`,
    thumb: `${AVATAR_BASE}/shri-raj-thumb.svg`,
    monogram: "Ш",
    artDirection:
      "Indian astrologer, mandala, star chart, calm; deep blue + gold. Drop-in: shri-raj.webp.",
    moodFrom: "#0f1a3d",
    moodTo: "#1e3a6e",
    glow: "rgba(245, 158, 11, 0.4)",
  },
  gadalka_marina: {
    id: "gadalka_marina",
    portrait: `${AVATAR_BASE}/marina.svg`,
    thumb: `${AVATAR_BASE}/marina-thumb.svg`,
    monogram: "M",
    artDirection:
      "Modern elegant tarot reader, cards; dark golden mystique. Drop-in: marina.webp or gadalka_marina.webp.",
    moodFrom: "#1a1408",
    moodTo: "#3d3018",
    glow: "rgba(236, 72, 153, 0.35)",
  },
};

const DEFAULT_SLOT: MasterAvatarSlot = {
  id: "_default",
  portrait: `${AVATAR_BASE}/default.svg`,
  thumb: `${AVATAR_BASE}/default-thumb.svg`,
  monogram: "✦",
  artDirection: "Generic Aura master placeholder.",
  moodFrom: "#12101a",
  moodTo: "#2a2438",
  glow: "rgba(232, 199, 126, 0.35)",
};

export function getMasterAvatarSlot(masterId?: string | null): MasterAvatarSlot {
  if (!masterId) return DEFAULT_SLOT;
  return MASTER_AVATAR_SLOTS[masterId] ?? DEFAULT_SLOT;
}

/** Prefer final .webp if present in public (convention); client uses SVG until uploaded. */
export function masterPortraitSrc(masterId?: string | null, thumb = false): string {
  const slot = getMasterAvatarSlot(masterId);
  return thumb ? slot.thumb : slot.portrait;
}

export function masterTagline(masterId: string, title?: string): string {
  const taglines: Record<string, string> = {
    ragnar: "Суровая правда рун и северная сила",
    veronika: "Таро с мягкой психологической глубиной",
    agafya: "Славянские знаки и семейная мудрость",
    "shri-raj": "Джйотиш: карма, звёзды и предназначение",
    gadalka_marina: "Авторские расклады и лунная интуиция",
  };
  return taglines[masterId] ?? title ?? "Персональный эзотерический наставник";
}

export function masterSystemLabel(masterId: string, title?: string): string {
  return title ?? masterTagline(masterId);
}

export function resolveMasterIdForAvatar(id: string): string {
  return id;
}

export function deckSystemForMaster(masterId: string): DeckSystem {
  return resolveMasterDeckSystem(masterId);
}
