"use client";

interface RuneCostProps {
  cost: number;
  enabled?: boolean;
  className?: string;
  /** Show "бесплатно" when cost is 0 */
  showFree?: boolean;
}

export default function RuneCost({
  cost,
  enabled = true,
  className = "",
  showFree = false,
}: RuneCostProps) {
  if (!enabled) return null;
  if (cost <= 0) {
    if (!showFree) return null;
    return (
      <span className={`text-emerald-400/90 text-sm ${className}`}>бесплатно</span>
    );
  }
  return (
    <span className={`text-amber-400 text-sm font-medium ${className}`}>
      ᚢ {cost} рун
    </span>
  );
}
