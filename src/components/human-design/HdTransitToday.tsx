"use client";

import { useEffect, useState } from "react";
import type { HdBodyKey } from "@/lib/human-design";
import { GATE_NAMES_RU } from "@/lib/human-design";

const BODY_GLYPH: Record<HdBodyKey, string> = {
  sun: "☉", earth: "⊕", moon: "☽", northNode: "☊", southNode: "☋",
  mercury: "☿", venus: "♀", mars: "♂", jupiter: "♃", saturn: "♄",
  uranus: "♅", neptune: "♆", pluto: "♇",
};

const BODY_NAMES_RU: Record<HdBodyKey, string> = {
  sun: "Солнце", earth: "Земля", moon: "Луна",
  northNode: "Северный узел", southNode: "Южный узел",
  mercury: "Меркурий", venus: "Венера", mars: "Марс",
  jupiter: "Юпитер", saturn: "Сатурн", uranus: "Уран",
  neptune: "Нептун", pluto: "Плутон",
};

const HIGHLIGHT_BODIES: HdBodyKey[] = ["sun", "earth", "moon", "mercury", "venus", "mars"];

interface TransitActivation {
  body: HdBodyKey;
  gate: number;
  line: number;
}

/** "Погода дня": текущие транзиты на хабе Дизайна Человека. */
export default function HdTransitToday() {
  const [items, setItems] = useState<TransitActivation[] | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/human-design/transits")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { activations?: TransitActivation[] } | null) => {
        if (cancelled) return;
        if (!d?.activations) {
          setError(true);
          return;
        }
        setItems(
          HIGHLIGHT_BODIES.map((b) => d.activations!.find((a) => a.body === b)!).filter(Boolean)
        );
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-3xl border border-amber-500/20 bg-amber-500/[0.05] p-5">
        <p className="text-[0.625rem] font-medium uppercase tracking-[0.25em] text-amber-200/60">
          Погода дня · транзиты сейчас
        </p>
        <p className="mt-3 text-sm text-white/55">Загружаем текущее небо…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-amber-500/20 bg-amber-500/[0.05] p-5">
        <p className="text-[0.625rem] font-medium uppercase tracking-[0.25em] text-amber-200/60">
          Погода дня · транзиты сейчас
        </p>
        <p className="mt-3 text-sm text-white/55">
          Не удалось загрузить текущие транзиты. Обновите страницу чуть позже.
        </p>
      </div>
    );
  }

  if (!items) return null;

  return (
    <div className="rounded-3xl border border-amber-500/20 bg-amber-500/[0.05] p-5">
      <p className="text-[0.625rem] font-medium uppercase tracking-[0.25em] text-amber-200/60">
        Погода дня · транзиты сейчас
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        {items.map((a) => (
          <li key={a.body} className="flex items-center gap-2 text-white/80">
            <span className="w-5 text-center text-amber-100/80">{BODY_GLYPH[a.body]}</span>
            <span>
              <span className="font-semibold text-amber-100/90">
                {a.gate}.{a.line}
              </span>{" "}
              <span className="text-white/55">{GATE_NAMES_RU[a.gate] ?? ""}</span>
              <span className="sr-only"> ({BODY_NAMES_RU[a.body]})</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[0.6875rem] leading-relaxed text-white/45">
        Транзиты — текущие позиции планет. Они временно активируют ворота вашей карты:
        рассчитайте карту и нажмите «Транзиты», чтобы увидеть наложение.
      </p>
    </div>
  );
}
