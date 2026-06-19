/** Stylized gold sigils per master — replaces emoji in showcase cards. */
const SIGILS: Record<string, React.ReactNode> = {
  ragnar: (
    <>
      <path d="M32 10 L32 54 M18 22 L46 22 M22 38 L42 38" stroke="currentColor" strokeWidth="1.5" />
      <path d="M26 14 L32 22 L38 14" stroke="currentColor" strokeWidth="1.25" fill="none" />
      <circle cx="32" cy="32" r="20" stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
    </>
  ),
  veronika: (
    <>
      <path
        d="M32 14 C22 14 18 24 18 32 C18 42 32 50 32 50 C32 50 46 42 46 32 C46 24 42 14 32 14 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <circle cx="32" cy="30" r="4" stroke="currentColor" strokeWidth="1" fill="none" />
    </>
  ),
  agafya: (
    <>
      <circle cx="32" cy="32" r="18" stroke="currentColor" strokeWidth="1.25" fill="none" />
      <circle cx="32" cy="32" r="8" stroke="currentColor" strokeWidth="1" fill="none" />
      <circle cx="32" cy="32" r="2.5" fill="currentColor" />
      <path d="M32 14 L32 50 M14 32 L50 32" stroke="currentColor" strokeWidth="0.75" opacity="0.5" />
    </>
  ),
  "shri-raj": (
    <>
      <circle cx="32" cy="32" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <line
          key={deg}
          x1="32"
          y1="32"
          x2={32 + 18 * Math.cos((deg * Math.PI) / 180)}
          y2={32 + 18 * Math.sin((deg * Math.PI) / 180)}
          stroke="currentColor"
          strokeWidth="1"
        />
      ))}
      <circle cx="32" cy="32" r="20" stroke="currentColor" strokeWidth="0.75" opacity="0.35" fill="none" />
    </>
  ),
};

export default function MasterSigil({
  masterId,
  className = "",
}: {
  masterId: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden fill="none">
      {SIGILS[masterId] ?? (
        <path
          d="M32 12l6 12 12 2-9 9 2 12-11-6-11 6 2-12-9-9 12-2 6-12z"
          stroke="currentColor"
          strokeWidth="1.25"
        />
      )}
    </svg>
  );
}
