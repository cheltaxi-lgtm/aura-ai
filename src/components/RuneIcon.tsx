type RuneIconProps = {
  className?: string;
  title?: string;
};

/** Uruz (ᚢ / U+16A2) — SVG so the glyph never falls back to a tofu box. */
export default function RuneIcon({ className = "inline-block h-[1em] w-[0.7em]", title = "ᚢ" }: RuneIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 48"
      fill="currentColor"
      role="img"
      aria-label={title}
      focusable="false"
    >
      <title>{title}</title>
      <path d="M6 4 L16 44 L26 4 L22.5 4 L16 32.5 L9.5 4 Z" />
    </svg>
  );
}

/** Inline rune for string-like UI: “120 ᚢ”. */
export function RuneAmount({ amount, className = "" }: { amount: number | string; className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1 ${className}`.trim()}>
      <span>{amount}</span>
      <RuneIcon className="relative top-[0.05em] h-[0.95em] w-[0.65em]" />
    </span>
  );
}
