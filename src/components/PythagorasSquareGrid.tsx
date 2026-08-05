"use client";

import type { PythagorasSquareResult } from "@/lib/numerology/pythagoras-square";

interface PythagorasSquareGridProps {
  square: PythagorasSquareResult;
  className?: string;
}

const GRID: (1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9)[][] = [
  [1, 4, 7],
  [2, 5, 8],
  [3, 6, 9],
];

export default function PythagorasSquareGrid({ square, className = "" }: PythagorasSquareGridProps) {
  return (
    <div className={`rounded-xl border border-aura-gold/20 bg-black/30 p-3 ${className}`}>
      <p className="mb-2 text-[10px] uppercase tracking-widest text-aura-gold/70">
        Квадрат Пифагора
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {GRID.flat().map((n) => {
          const count = square.cells[n];
          const display = count > 0 ? String(n).repeat(Math.min(count, 4)) : "—";
          return (
            <div
              key={n}
              className="flex min-h-[2.5rem] items-center justify-center rounded-lg border border-white/10 bg-aura-raised/40 px-1 text-center font-display text-sm text-aura-champagne"
              title={`${n}: ${count} цифр`}
            >
              {display}
            </div>
          );
        })}
      </div>
    </div>
  );
}
