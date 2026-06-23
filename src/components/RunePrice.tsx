import RuneIcon from "@/components/RuneIcon";

interface RunePriceProps {
  value: number | string;
  className?: string;
  /** Показать слово «рун/руны» после числа */
  showUnit?: boolean;
  iconClassName?: string;
}

export default function RunePrice({
  value,
  className = "",
  showUnit = false,
  iconClassName = "h-3.5 w-3.5",
}: RunePriceProps) {
  const numeric = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  const unit =
    showUnit && Number.isFinite(numeric)
      ? numeric === 1
        ? " руна"
        : numeric >= 2 && numeric <= 4
          ? " руны"
          : " рун"
      : "";

  return (
    <span className={`inline-flex items-center gap-1 align-middle ${className}`.trim()}>
      <RuneIcon className={iconClassName} />
      <span>{value}</span>
      {unit ? <span className="opacity-90">{unit}</span> : null}
    </span>
  );
}
