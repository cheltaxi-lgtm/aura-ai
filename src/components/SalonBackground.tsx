/** Night salon sky — stars + fine brass constellation lines. */
export default function SalonBackground() {
  return (
    <div className="salon-bg" aria-hidden="true">
      <div className="salon-bg__base" />
      <div className="salon-bg__glow" />
      <div className="salon-bg__stars salon-bg__stars--far" />
      <div className="salon-bg__stars salon-bg__stars--near" />
      <svg className="salon-bg__lines" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        <g fill="none" stroke="rgba(232,199,126,0.28)" strokeWidth="1.2">
          <path d="M80 120 C220 40, 380 200, 520 160 S780 40, 920 120 S1100 220, 1140 180" />
          <path d="M40 520 C180 460, 320 580, 480 540 S760 420, 900 500 S1080 620, 1180 560" />
          <path d="M160 720 C300 640, 420 700, 560 660 S820 580, 980 640" />
        </g>
        <g fill="none" stroke="rgba(201,162,74,0.22)" strokeWidth="1">
          <path d="M200 80 L340 220 L280 360 L460 400" />
          <path d="M720 100 L860 180 L820 320 L980 280 L1040 400" />
          <path d="M100 400 L220 480 L180 600 L340 640" />
          <path d="M640 520 L760 600 L720 700 L880 680" />
        </g>
        <g fill="rgba(255,245,220,0.55)">
          <circle cx="340" cy="220" r="2.4" />
          <circle cx="280" cy="360" r="2" />
          <circle cx="460" cy="400" r="2.8" />
          <circle cx="860" cy="180" r="2.4" />
          <circle cx="820" cy="320" r="1.8" />
          <circle cx="980" cy="280" r="2.6" />
          <circle cx="220" cy="480" r="2.1" />
          <circle cx="340" cy="640" r="2.3" />
          <circle cx="760" cy="600" r="2" />
          <circle cx="880" cy="680" r="2.5" />
          <circle cx="520" cy="160" r="2.1" />
          <circle cx="900" cy="500" r="2.4" />
        </g>
      </svg>
      <div className="salon-bg__vignette" />
    </div>
  );
}
