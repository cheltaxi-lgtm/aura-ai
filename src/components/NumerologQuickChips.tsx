"use client";

const PERIOD_CHIPS = [
  {
    id: "today",
    emoji: "☀️",
    label: "Сегодня",
    message: "Расклад по цифрам на сегодня",
  },
  {
    id: "week",
    emoji: "📆",
    label: "Неделя",
    message: "Расклад по цифрам на неделю",
  },
  {
    id: "month",
    emoji: "🗓️",
    label: "Месяц",
    message: "Расклад по цифрам на месяц",
  },
] as const;

interface NumerologQuickChipsProps {
  disabled?: boolean;
  onSend: (message: string) => void;
}

function ChipButton({
  emoji,
  label,
  disabled,
  onClick,
}: {
  emoji: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex min-h-[2.25rem] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-aura-purple/25 bg-gradient-to-b from-violet-950/50 to-indigo-950/80 px-3 py-2 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aura-purple/60 disabled:pointer-events-none disabled:opacity-40 sm:min-h-[2.5rem] sm:w-full sm:px-2"
    >
      <span className="text-sm leading-none opacity-90" aria-hidden>
        {emoji}
      </span>
      <span className="text-[11px] font-medium leading-tight text-aura-champagne/95 group-hover:text-aura-champagne sm:text-xs">
        {label}
      </span>
    </button>
  );
}

export default function NumerologQuickChips({
  disabled = false,
  onSend,
}: NumerologQuickChipsProps) {
  const send = (message: string) => {
    if (disabled) return;
    onSend(message);
  };

  return (
    <div
      className="mb-2 rounded-2xl border border-aura-gold/15 bg-gradient-to-b from-[#141028]/90 to-[#0a0812]/95 p-2 shadow-[0_4px_24px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(212,175,55,0.06)] sm:p-3"
      role="region"
      aria-label="Расклад по периоду"
    >
      <p className="mb-2 px-1 text-[10px] font-medium uppercase tracking-[0.22em] text-aura-gold/55">
        Период
      </p>
      <div
        className="grid grid-cols-3 gap-1.5 sm:gap-2"
        role="toolbar"
        aria-label="Расклад по периоду"
      >
        {PERIOD_CHIPS.map((chip) => (
          <ChipButton
            key={chip.id}
            emoji={chip.emoji}
            label={chip.label}
            disabled={disabled}
            onClick={() => send(chip.message)}
          />
        ))}
      </div>
    </div>
  );
}
