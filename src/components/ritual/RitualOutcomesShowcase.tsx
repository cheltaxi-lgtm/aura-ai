import { RITUAL_TYPES, MASTER_VISUAL, type RitualMasterKey } from "@/lib/ritual-config";
import type { PublicRitualOutcome } from "@/lib/ritual-service";

interface Props {
  outcomes: PublicRitualOutcome[];
  title?: string;
}

function formatOutcomeDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  } catch {
    return "";
  }
}

export default function RitualOutcomesShowcase({ outcomes, title }: Props) {
  if (outcomes.length === 0) return null;

  return (
    <section className="mt-10">
      <p className="font-display text-lg text-white">{title ?? "Что говорят о знаках после обряда"}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {outcomes.map((o, i) => {
          const master =
            MASTER_VISUAL[o.characterKey as RitualMasterKey] ?? { emoji: "🕯", name: o.characterKey };
          const ritual = RITUAL_TYPES[o.ritualType];
          return (
            <div
              key={i}
              className="rounded-xl border border-white/10 bg-white/5 p-5"
            >
              <p className="text-sm leading-relaxed text-white/80">«{o.outcomeText}»</p>
              <div className="mt-3 flex items-center justify-between text-xs text-white/40">
                <span>
                  {master.emoji} {master.name} · {ritual?.emoji} {ritual?.label}
                </span>
                <span>{"★".repeat(o.outcomeRating)} · {formatOutcomeDate(o.createdAt)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
