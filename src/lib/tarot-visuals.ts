import { MAJOR_ARCANA, type TarotCard } from "@/lib/tarot";

export interface TarotCardVisual {
  gradient: string;
  symbol: string;
  border: string;
  glow: string;
}

const DEFAULT_VISUAL: TarotCardVisual = {
  gradient: "from-aura-purple/35 via-violet-950 to-black",
  symbol: "✦",
  border: "border-aura-purple/40",
  glow: "shadow-neon",
};

export const TAROT_CARD_VISUALS: Record<number, TarotCardVisual> = {
  0: { gradient: "from-amber-500/30 via-orange-950 to-black", symbol: "🃏", border: "border-amber-400/40", glow: "shadow-[0_0_24px_rgba(251,191,36,0.25)]" },
  1: { gradient: "from-red-500/25 via-rose-950 to-black", symbol: "☿", border: "border-red-400/35", glow: "shadow-[0_0_24px_rgba(248,113,113,0.2)]" },
  2: { gradient: "from-indigo-400/30 via-blue-950 to-black", symbol: "☽", border: "border-indigo-300/40", glow: "shadow-[0_0_24px_rgba(129,140,248,0.25)]" },
  3: { gradient: "from-emerald-500/30 via-green-950 to-black", symbol: "♀", border: "border-emerald-400/40", glow: "shadow-[0_0_24px_rgba(52,211,153,0.2)]" },
  4: { gradient: "from-slate-400/25 via-slate-950 to-black", symbol: "♔", border: "border-slate-300/35", glow: "shadow-[0_0_20px_rgba(148,163,184,0.2)]" },
  5: { gradient: "from-stone-400/25 via-stone-950 to-black", symbol: "☤", border: "border-stone-300/35", glow: "shadow-[0_0_20px_rgba(168,162,158,0.15)]" },
  6: { gradient: "from-pink-500/30 via-fuchsia-950 to-black", symbol: "♥", border: "border-pink-400/40", glow: "shadow-[0_0_24px_rgba(244,114,182,0.25)]" },
  7: { gradient: "from-cyan-500/25 via-teal-950 to-black", symbol: "⚡", border: "border-cyan-400/35", glow: "shadow-[0_0_24px_rgba(34,211,238,0.2)]" },
  8: { gradient: "from-orange-500/25 via-amber-950 to-black", symbol: "∞", border: "border-orange-400/35", glow: "shadow-[0_0_24px_rgba(251,146,60,0.2)]" },
  9: { gradient: "from-violet-500/25 via-purple-950 to-black", symbol: "🕯", border: "border-violet-400/35", glow: "shadow-[0_0_24px_rgba(167,139,250,0.2)]" },
  10: { gradient: "from-yellow-500/30 via-amber-950 to-black", symbol: "☸", border: "border-yellow-400/40", glow: "shadow-[0_0_24px_rgba(250,204,21,0.25)]" },
  11: { gradient: "from-sky-400/25 via-blue-950 to-black", symbol: "⚖", border: "border-sky-300/35", glow: "shadow-[0_0_20px_rgba(56,189,248,0.2)]" },
  12: { gradient: "from-teal-500/25 via-cyan-950 to-black", symbol: "↻", border: "border-teal-400/35", glow: "shadow-[0_0_20px_rgba(45,212,191,0.2)]" },
  13: { gradient: "from-zinc-500/25 via-zinc-950 to-black", symbol: "☠", border: "border-zinc-400/35", glow: "shadow-[0_0_20px_rgba(161,161,170,0.15)]" },
  14: { gradient: "from-lime-500/25 via-emerald-950 to-black", symbol: "☯", border: "border-lime-400/35", glow: "shadow-[0_0_24px_rgba(132,204,22,0.2)]" },
  15: { gradient: "from-red-600/30 via-red-950 to-black", symbol: "♄", border: "border-red-500/40", glow: "shadow-[0_0_24px_rgba(239,68,68,0.25)]" },
  16: { gradient: "from-orange-600/30 via-red-950 to-black", symbol: "⚡", border: "border-orange-500/40", glow: "shadow-[0_0_28px_rgba(234,88,12,0.3)]" },
  17: { gradient: "from-blue-400/30 via-indigo-950 to-black", symbol: "✧", border: "border-blue-300/40", glow: "shadow-[0_0_28px_rgba(96,165,250,0.3)]" },
  18: { gradient: "from-purple-500/30 via-indigo-950 to-black", symbol: "☾", border: "border-purple-400/40", glow: "shadow-[0_0_24px_rgba(168,85,247,0.25)]" },
  19: { gradient: "from-yellow-400/35 via-amber-900 to-black", symbol: "☀", border: "border-yellow-300/45", glow: "shadow-neon-gold" },
  20: { gradient: "from-violet-400/30 via-purple-950 to-black", symbol: "📯", border: "border-violet-300/40", glow: "shadow-[0_0_24px_rgba(196,181,253,0.25)]" },
  21: { gradient: "from-emerald-400/30 via-teal-950 to-black", symbol: "🌍", border: "border-emerald-300/40", glow: "shadow-[0_0_24px_rgba(52,211,153,0.25)]" },
};

export function resolveTarotCard(card: {
  id?: number;
  name: string;
  meaning?: string;
}): TarotCard {
  if (typeof card.id === "number") {
    const byId = MAJOR_ARCANA.find((c) => c.id === card.id);
    if (byId) return byId;
  }

  const byName = MAJOR_ARCANA.find((c) => c.name === card.name);
  if (byName) return byName;

  return {
    id: -1,
    name: card.name,
    arcana: "major",
    meaning: card.meaning ?? "",
  };
}

export function tarotCardVisual(card: { id?: number; name: string }): TarotCardVisual {
  const resolved = resolveTarotCard(card);
  if (resolved.id >= 0) return TAROT_CARD_VISUALS[resolved.id] ?? DEFAULT_VISUAL;
  return DEFAULT_VISUAL;
}

export function tarotCardRoman(id: number): string {
  if (id < 0) return "—";
  if (id === 0) return "0";
  const romans = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI"];
  return romans[id - 1] ?? String(id);
}
