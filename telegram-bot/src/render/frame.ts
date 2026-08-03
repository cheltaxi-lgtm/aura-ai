/** Shared premium frame / ornament SVG fragments for bot report images. */

export function frameDefs(): string {
  return `
    <defs>
      <radialGradient id="bg" cx="50%" cy="22%" r="78%">
        <stop offset="0%" stop-color="#2C221C"/>
        <stop offset="55%" stop-color="#161210"/>
        <stop offset="100%" stop-color="#0A0908"/>
      </radialGradient>
      <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#E8D5A8"/>
        <stop offset="45%" stop-color="#C4A574"/>
        <stop offset="100%" stop-color="#8A7349"/>
      </linearGradient>
      <linearGradient id="goldSoft" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#C4A574" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#C4A574" stop-opacity="0.15"/>
      </linearGradient>
    </defs>`;
}

/** Double gold frame + corner ticks. */
export function ornateFrame(width: number, height: number, inset = 28): string {
  const o = inset;
  const i = inset + 10;
  const c = 22; // corner arm length
  return `
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <rect x="${o}" y="${o}" width="${width - o * 2}" height="${height - o * 2}"
      fill="none" stroke="url(#gold)" stroke-opacity="0.75" stroke-width="2.5" rx="6"/>
    <rect x="${i}" y="${i}" width="${width - i * 2}" height="${height - i * 2}"
      fill="none" stroke="url(#goldSoft)" stroke-width="1" rx="4"/>
    <!-- corners -->
    <path d="M${o} ${o + c} V${o} H${o + c}" fill="none" stroke="url(#gold)" stroke-width="3" stroke-linecap="square"/>
    <path d="M${width - o - c} ${o} H${width - o} V${o + c}" fill="none" stroke="url(#gold)" stroke-width="3" stroke-linecap="square"/>
    <path d="M${o} ${height - o - c} V${height - o} H${o + c}" fill="none" stroke="url(#gold)" stroke-width="3" stroke-linecap="square"/>
    <path d="M${width - o - c} ${height - o} H${width - o} V${height - o - c}" fill="none" stroke="url(#gold)" stroke-width="3" stroke-linecap="square"/>
    <line x1="${width * 0.28}" y1="${o + 52}" x2="${width * 0.72}" y2="${o + 52}"
      stroke="url(#gold)" stroke-opacity="0.35" stroke-width="1"/>
  `;
}

export function brandHeader(width: number, y: number, label = "ZOVUS"): string {
  // Prefer DejaVu — installed on the VPS; Georgia triggers slow fontconfig fallback.
  return `
    <text x="50%" y="${y}" text-anchor="middle"
      font-family="DejaVu Serif, Georgia, 'Times New Roman', serif" font-size="18" letter-spacing="6"
      fill="#C4A574">${label}</text>
  `;
}
