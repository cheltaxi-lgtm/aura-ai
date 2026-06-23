interface RuneIconProps {
  className?: string;
  title?: string;
}

/** Золотая SVG-иконка руны (Uruz) для цен и тарифов */
export default function RuneIcon({ className = "h-4 w-4", title }: RuneIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M12 3.5L7.5 20.5H10.2L12 14.2L13.8 20.5H16.5L12 3.5Z"
        fill="currentColor"
      />
      <path
        d="M9.5 20.5H14.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}
