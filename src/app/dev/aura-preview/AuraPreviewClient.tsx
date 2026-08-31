"use client";

import { useMemo, useState } from "react";

import AuraMap from "@/components/aura/AuraMap";
import {
  AURA_CHAKRA_KEYS,
  AURA_CHAKRA_NAMES,
  AURA_COLORS,
  AURA_LAYER_KEYS,
  AURA_LAYER_NAMES,
  type AuraChakraOpenness,
  type AuraColorKey,
  type AuraSnapshot,
} from "@/lib/aura-constants";

const CHAKRA_HEX: Record<(typeof AURA_CHAKRA_KEYS)[number], string> = {
  muladhara: "#c94f4f",
  svadhisthana: "#e08b4a",
  manipura: "#e8c46a",
  anahata: "#3fae7a",
  vishuddha: "#4f8fd0",
  ajna: "#4b5bbd",
  sahasrara: "#8b6fd8",
};

const CASES: {
  id: string;
  label: string;
  core: AuraColorKey;
  outer: AuraColorKey;
  extra?: AuraColorKey;
  verdict: AuraSnapshot["verdict"];
  openness: AuraChakraOpenness[];
}[] = [
  {
    id: "blue-smoke",
    label: "Синий / дымчатый",
    core: "blue",
    outer: "smoke",
    extra: "silver",
    verdict: "mixed",
    openness: ["balanced", "blocked", "balanced", "open", "balanced", "blocked", "open"],
  },
  {
    id: "warm",
    label: "Красный / оранжевый",
    core: "red",
    outer: "orange",
    extra: "gold",
    verdict: "bright",
    openness: ["open", "open", "balanced", "balanced", "open", "balanced", "balanced"],
  },
  {
    id: "light",
    label: "Золотой / белый",
    core: "gold",
    outer: "white",
    extra: "silver",
    verdict: "bright",
    openness: ["balanced", "open", "open", "open", "balanced", "open", "open"],
  },
  {
    id: "weak",
    label: "Индиго / закрытые чакры",
    core: "indigo",
    outer: "violet",
    extra: "smoke",
    verdict: "heavy",
    openness: ["blocked", "blocked", "balanced", "blocked", "blocked", "open", "blocked"],
  },
];

function snapshotFor(id: string): AuraSnapshot {
  const spec = CASES.find((c) => c.id === id) ?? CASES[0];
  const core = AURA_COLORS[spec.core];
  const outer = AURA_COLORS[spec.outer];
  const extra = spec.extra ? AURA_COLORS[spec.extra] : outer;
  return {
    version: 1,
    faceDetected: true,
    dominantColor: core,
    secondaryColors: [outer, extra],
    layers: AURA_LAYER_KEYS.map((key) => ({
      key,
      name: AURA_LAYER_NAMES[key],
      state: "ровное свечение, без отдельной оболочки",
    })),
    chakras: AURA_CHAKRA_KEYS.map((key, i) => ({
      key,
      name: AURA_CHAKRA_NAMES[key],
      color: CHAKRA_HEX[key],
      openness: spec.openness[i] ?? "balanced",
      note: spec.openness[i] === "blocked" ? "тише обычного" : "держится ровно",
    })),
    verdict: spec.verdict,
    teaser: `${core.meaning}. Снаружи — ${outer.meaning}.`,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

export default function AuraPreviewClient() {
  const [id, setId] = useState(CASES[0].id);
  const snapshot = useMemo(() => snapshotFor(id), [id]);

  return (
    <main className="page-with-site-header mx-auto max-w-2xl px-4 py-8 text-white">
      <p className="text-xs uppercase tracking-[0.18em] text-white/40">Internal QA</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {CASES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`rounded-full border px-3 py-1.5 text-xs ${
              id === c.id
                ? "border-white/30 bg-white/10"
                : "border-white/10 bg-transparent text-white/70"
            }`}
            onClick={() => setId(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        <AuraMap snapshot={snapshot} />
      </div>
    </main>
  );
}
