/** Fixed cosmic background — inline SVG decor (no external assets). */
export default function MysticBackground() {
  return (
    <div className="aura-mystic-bg" aria-hidden="true">
      <div className="aura-mystic-bg__base" />
      <div className="aura-mystic-bg__glow-sharp" />
      <div className="aura-mystic-bg__nebula aura-mystic-bg__nebula--violet" />
      <div className="aura-mystic-bg__nebula aura-mystic-bg__nebula--indigo" />
      <div className="aura-mystic-bg__stars aura-mystic-bg__stars--far" />
      <div className="aura-mystic-bg__illustrations">
        <svg
          className="aura-mystic-bg__orbit"
          viewBox="0 0 480 480"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="240" cy="240" r="210" stroke="#E8C77E" strokeOpacity="0.14" strokeWidth="1" />
          <circle
            cx="240"
            cy="240"
            r="168"
            stroke="#B794F6"
            strokeOpacity="0.18"
            strokeWidth="0.8"
            strokeDasharray="6 10"
          />
          <circle cx="240" cy="240" r="124" stroke="#E8C77E" strokeOpacity="0.12" strokeWidth="0.7" />
          <path
            d="M240 30 L240 54 M240 426 L240 450 M30 240 L54 240 M426 240 L450 240"
            stroke="#E8C77E"
            strokeOpacity="0.22"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          <path
            d="M96 96 L112 112 M368 368 L384 384 M384 96 L368 112 M96 384 L112 368"
            stroke="#C4B5FD"
            strokeOpacity="0.16"
            strokeWidth="0.7"
            strokeLinecap="round"
          />
          <circle cx="240" cy="30" r="3" fill="#E8C77E" fillOpacity="0.55" />
          <circle cx="450" cy="240" r="2.5" fill="#B794F6" fillOpacity="0.5" />
          <circle cx="240" cy="450" r="2.5" fill="#E8C77E" fillOpacity="0.45" />
          <circle cx="30" cy="240" r="2.5" fill="#C4B5FD" fillOpacity="0.45" />
          <path
            d="M240 118 C286 118 322 154 322 200 C322 246 286 282 240 282 C194 282 158 246 158 200 C158 154 194 118 240 118 Z"
            stroke="#E8C77E"
            strokeOpacity="0.1"
            strokeWidth="0.8"
          />
        </svg>
        <svg
          className="aura-mystic-bg__sketch aura-mystic-bg__sketch--moon"
          viewBox="0 0 240 240"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="120" cy="120" r="118" stroke="#E8C77E" strokeWidth="0.6" opacity="0.25" />
          <circle
            cx="120"
            cy="120"
            r="92"
            stroke="#B794F6"
            strokeWidth="0.5"
            strokeDasharray="4 7"
            opacity="0.35"
          />
          <path
            d="M148 68c-28 8-48 32-48 58 0 36 29 65 65 65 8 0 16-1 23-4-38-6-66-38-66-78 0-22 9-42 26-41z"
            fill="#E8C77E"
            fillOpacity="0.12"
            stroke="#E8C77E"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d="M58 42l4 8M72 34l2 10M46 58l8 4"
            stroke="#E8C77E"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.55"
          />
          <path
            d="M182 178l6 3M194 164l3 7M170 188l7 2"
            stroke="#C4B5FD"
            strokeWidth="0.9"
            strokeLinecap="round"
            opacity="0.5"
          />
        </svg>
        <svg
          className="aura-mystic-bg__sketch aura-mystic-bg__sketch--sigils"
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g stroke="#E8C77E" strokeWidth="0.75" opacity="0.45">
            <circle cx="100" cy="100" r="22" />
            <circle cx="100" cy="100" r="34" strokeDasharray="3 5" />
            <path d="M100 66v-12M100 134v12M66 100h-12M134 100h12" />
            <path d="M78 78l-8-8M122 122l8 8M122 78l8-8M78 122l-8 8" />
          </g>
          <path
            d="M100 38c-10 8-10 18 0 24 10-6 10-16 0-24z"
            fill="#B794F6"
            fillOpacity="0.18"
            stroke="#C4B5FD"
            strokeWidth="0.6"
          />
          <path
            d="M162 100c-8 10-18 10-24 0 6-10 16-10 24 0z"
            fill="#E8C77E"
            fillOpacity="0.1"
            stroke="#E8C77E"
            strokeWidth="0.6"
          />
          <path
            d="M38 100c8-10 18-10 24 0-6 10-16 10-24 0z"
            fill="#E8C77E"
            fillOpacity="0.08"
            stroke="#E8C77E"
            strokeWidth="0.6"
          />
        </svg>
        <div className="aura-mystic-bg__card-heap aura-mystic-bg__card-heap--left">
          <div className="aura-mystic-bg__oracle aura-mystic-bg__oracle--back" />
          <div className="aura-mystic-bg__oracle aura-mystic-bg__oracle--mid" />
          <div className="aura-mystic-bg__oracle aura-mystic-bg__oracle--front">
            <span aria-hidden>☽</span>
          </div>
        </div>
        <div className="aura-mystic-bg__card-heap aura-mystic-bg__card-heap--right">
          <div className="aura-mystic-bg__oracle aura-mystic-bg__oracle--back" />
          <div className="aura-mystic-bg__oracle aura-mystic-bg__oracle--mid" />
          <div className="aura-mystic-bg__oracle aura-mystic-bg__oracle--front">
            <span aria-hidden>✦</span>
          </div>
        </div>
      </div>
      <div className="aura-mystic-bg__vignette" />
    </div>
  );
}
