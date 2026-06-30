"use client";

import { useRef, useState } from "react";
import ShareButton from "@/components/share/ShareButton";
import { ritualToSharePayload } from "@/lib/share/payload-builders";
import { RITUAL_TYPES, type RitualType } from "@/lib/ritual-config";
import { getCharacterById } from "@/lib/characters";

export interface RitualClientData {
  id: string;
  characterKey: string;
  ritualType: RitualType;
  status: string;
  cards: Array<{ name: string; position: string }>;
  moonPhase: string | null;
  moonSign: string | null;
  ritualTime: string | null;
  ritualPlace: string | null;
  ritualItems: Array<{ item: string; reason: string }>;
  ritualSteps: Array<{ step: string; description: string }>;
  ritualWords: string | null;
  ritualWordOfPower: string | null;
  ritualWordOfPowerTranscription?: string | null;
  ritualForbids: string[];
  ritualSigns: string[];
  outcomeRating?: number | null;
  remindAt?: string | null;
  remindedAt?: string | null;
  hasCard?: boolean;
  runeCost?: number;
  createdAt: string;
}

interface Props {
  ritual: RitualClientData;
  onDone: () => void;
}

export default function RitualCard({ ritual, onDone }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const cfg = RITUAL_TYPES[ritual.ritualType];
  const master = getCharacterById(ritual.characterKey);
  const date = new Date(ritual.createdAt).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const handleSave = async () => {
    if (!cardRef.current || saving) return;
    setSaving(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: "#0a0a0f",
        scale: 2,
      });
      const link = document.createElement("a");
      link.download = `ritual-${ritual.ritualType}-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      /* fallback silent */
    } finally {
      setSaving(false);
    }
  };

  const sharePayload = ritualToSharePayload(ritual);

  return (
    <div className="px-4 py-4">
      <div
        ref={cardRef}
        className="mx-auto max-w-md rounded-2xl border border-amber-500/30 p-6"
        style={{ background: "#0a0a0f" }}
      >
        <div className="border-b border-amber-500/20 pb-4 text-center">
          <p className="font-display text-xs uppercase tracking-[0.2em] text-amber-500/70">
            {master?.name ?? ritual.characterKey}
          </p>
          <h2 className="mt-1 font-display text-xl font-bold text-amber-100">
            {cfg.emoji} {cfg.label}
          </h2>
          <p className="mt-1 text-xs text-white/40">
            {date} · {ritual.moonPhase} в {ritual.moonSign}
          </p>
        </div>

        {ritual.ritualTime ? (
          <section className="mt-5">
            <h3 className="font-display text-xs uppercase tracking-widest text-amber-500">
              Время
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-white/85">
              {ritual.ritualTime}
            </p>
          </section>
        ) : null}

        {ritual.ritualPlace ? (
          <section className="mt-5">
            <h3 className="font-display text-xs uppercase tracking-widest text-amber-500">
              Место
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-white/85">
              {ritual.ritualPlace}
            </p>
          </section>
        ) : null}

        {ritual.ritualItems?.length ? (
          <section className="mt-5">
            <h3 className="font-display text-xs uppercase tracking-widest text-amber-500">
              Что нужно
            </h3>
            <ul className="mt-2 space-y-2">
              {ritual.ritualItems.map((item, i) => (
                <li key={i} className="text-sm text-white/80">
                  <span className="font-medium text-amber-200">{item.item}</span>
                  <span className="text-white/50"> — {item.reason}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {ritual.ritualSteps?.length ? (
          <section className="mt-5">
            <h3 className="font-display text-xs uppercase tracking-widest text-amber-500">
              Три шага
            </h3>
            <ol className="mt-2 space-y-3">
              {ritual.ritualSteps.map((step, i) => (
                <li
                  key={i}
                  className={`text-sm ${
                    step.step.includes("Кульминация")
                      ? "rounded-xl border border-amber-500/30 bg-amber-950/30 p-3"
                      : ""
                  }`}
                >
                  <p className="font-medium text-amber-200">{step.step}</p>
                  <p className="mt-1 leading-relaxed text-white/75">
                    {step.description}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {ritual.ritualWords ? (
          <section className="mt-5 rounded-xl border border-amber-500/20 bg-black/40 p-4">
            <h3 className="font-display text-xs uppercase tracking-widest text-amber-500">
              Слова
            </h3>
            <p className="mt-2 text-sm italic leading-relaxed text-amber-100/90">
              {ritual.ritualWords}
            </p>
            {ritual.ritualWordOfPower ? (
              <div className="mt-4 text-center">
                <p className="text-xs text-white/40">Слово силы</p>
                <p className="mt-1 font-display text-3xl font-bold tracking-widest text-amber-400">
                  {ritual.ritualWordOfPower}
                </p>
                {ritual.ritualWordOfPowerTranscription ? (
                  <p className="mt-1 text-sm text-white/55">
                    [{ritual.ritualWordOfPowerTranscription}]
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-white/40">
                  Произнеси трижды в момент ритуала
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        {ritual.ritualForbids?.length ? (
          <section className="mt-5">
            <h3 className="font-display text-xs uppercase tracking-widest text-red-400/80">
              Запреты
            </h3>
            <ul className="mt-2 space-y-1">
              {ritual.ritualForbids.map((f, i) => (
                <li key={i} className="text-sm text-red-300/80">
                  ✕ {f}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {ritual.ritualSigns?.length ? (
          <section className="mt-5">
            <h3 className="font-display text-xs uppercase tracking-widest text-emerald-400/80">
              В течение 7 дней жди:
            </h3>
            <ul className="mt-2 space-y-1">
              {ritual.ritualSigns.map((s, i) => (
                <li key={i} className="text-sm text-emerald-200/70">
                  ◈ {s}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {ritual.cards?.length ? (
          <section className="mt-5 border-t border-white/10 pt-4">
            <h3 className="font-display text-xs uppercase tracking-widest text-white/40">
              Карты сеанса
            </h3>
            <p className="mt-2 text-xs text-white/50">
              {ritual.cards.map((c) => `${c.position}: ${c.name}`).join(" · ")}
            </p>
          </section>
        ) : null}
      </div>

      <div className="mx-auto mt-6 flex max-w-md flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="btn-luxe btn-luxe--sm flex-1 border border-white/10 bg-white/5"
        >
          {saving ? "…" : "📥 Сохранить"}
        </button>
        <ShareButton
          payload={sharePayload}
          variant="pill"
          className="btn-luxe btn-luxe--sm flex-1"
          label="↗ Поделиться"
        />
        <button
          type="button"
          onClick={onDone}
          className="btn-luxe btn-luxe--sm btn-luxe--gold w-full"
        >
          ✓ Понятно — жду знаков
        </button>
      </div>
    </div>
  );
}
