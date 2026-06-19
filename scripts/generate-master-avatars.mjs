#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "masters", "avatars");
mkdirSync(OUT, { recursive: true });

const masters = [
  {
    file: "ragnar",
    monogram: "R",
    from: "#1a2838",
    to: "#2d4a62",
    accent: "#94a3b8",
    accent2: "#e8c77e",
    motif: "runes",
    label: "Рагнар",
  },
  {
    file: "veronika",
    monogram: "V",
    from: "#2a1438",
    to: "#4a2048",
    accent: "#c084fc",
    accent2: "#e8c77e",
    motif: "tarot",
    label: "Вероника",
  },
  {
    file: "agafya",
    monogram: "А",
    from: "#1a2818",
    to: "#2d4020",
    accent: "#6b8f5e",
    accent2: "#d4a574",
    motif: "herbs",
    label: "Агафья",
  },
  {
    file: "shri-raj",
    monogram: "Ш",
    from: "#0f1a3d",
    to: "#1a3070",
    accent: "#f59e0b",
    accent2: "#e8c77e",
    motif: "stars",
    label: "Шри Радж",
  },
  {
    file: "marina",
    monogram: "M",
    from: "#1a1408",
    to: "#302510",
    accent: "#ec4899",
    accent2: "#e8c77e",
    motif: "moon",
    label: "Marina",
  },
];

function motifLayer(m) {
  switch (m.motif) {
    case "runes":
      return `
  <g opacity="0.55" fill="none" stroke="url(#gold)" stroke-width="1.2">
    <rect x="62" y="320" width="28" height="38" rx="2" transform="rotate(-8 76 339)"/>
    <rect x="108" y="308" width="26" height="36" rx="2"/>
    <rect x="268" y="312" width="28" height="38" rx="2" transform="rotate(6 282 331)"/>
    <rect x="312" y="328" width="26" height="34" rx="2" transform="rotate(-4 325 345)"/>
  </g>
  <path d="M40 120 Q200 40 360 100" fill="none" stroke="#7dd3fc" stroke-width="1.5" opacity="0.35"/>
  <path d="M30 90 Q200 20 370 80" fill="none" stroke="#a5f3fc" stroke-width="1" opacity="0.25"/>`;
    case "tarot":
      return `
  <g opacity="0.5">
    <rect x="88" y="300" width="52" height="78" rx="4" fill="#1a1028" stroke="url(#gold)" stroke-width="1"/>
    <rect x="118" y="288" width="52" height="78" rx="4" fill="#221430" stroke="url(#gold)" stroke-width="1"/>
    <rect x="148" y="276" width="52" height="78" rx="4" fill="#2a1838" stroke="url(#gold)" stroke-width="1.2"/>
    <rect x="228" y="278" width="52" height="78" rx="4" fill="#2a1838" stroke="url(#gold)" stroke-width="1"/>
    <rect x="258" y="290" width="52" height="78" rx="4" fill="#221430" stroke="url(#gold)" stroke-width="1"/>
  </g>`;
    case "herbs":
      return `
  <g opacity="0.45" stroke="${m.accent}" stroke-width="1.2" fill="none">
    <path d="M70 360 Q90 320 85 280"/><path d="M330 365 Q310 325 315 285"/>
    <circle cx="72" cy="368" r="4" fill="${m.accent}" opacity="0.6"/>
    <circle cx="328" cy="370" r="4" fill="${m.accent}" opacity="0.6"/>
  </g>
  <ellipse cx="200" cy="400" rx="90" ry="12" fill="#000" opacity="0.35"/>`;
    case "stars":
      return `
  <circle cx="200" cy="200" r="95" fill="none" stroke="url(#gold)" stroke-width="0.8" opacity="0.35"/>
  <circle cx="200" cy="200" r="72" fill="none" stroke="url(#gold)" stroke-width="0.6" opacity="0.25"/>
  <circle cx="200" cy="200" r="48" fill="none" stroke="${m.accent}" stroke-width="0.5" opacity="0.4"/>
  <g fill="${m.accent}" opacity="0.7">
    <circle cx="200" cy="118" r="2.5"/><circle cx="268" cy="168" r="2"/><circle cx="132" cy="168" r="2"/>
    <circle cx="248" cy="248" r="1.8"/><circle cx="152" cy="248" r="1.8"/>
  </g>`;
    default:
      return `
  <circle cx="200" cy="130" r="38" fill="none" stroke="url(#gold)" stroke-width="1" opacity="0.4"/>
  <path d="M170 420 Q200 380 230 420" fill="none" stroke="url(#gold)" stroke-width="1" opacity="0.35"/>`;
  }
}

function portrait(m, w, h, fontSize, compact) {
  const headY = compact ? 58 : 175;
  const headRx = compact ? 22 : 52;
  const headRy = compact ? 26 : 62;
  const shoulders = compact
    ? `<ellipse cx="200" cy="${headY + 38}" rx="38" ry="22" fill="url(#sil)" opacity="0.75"/>`
    : `<path d="M200 ${headY + 50}c-55 0-95 35-95 72v40c0 8 85 12 95 12s95-4 95-12v-40c0-37-40-72-95-72z" fill="url(#sil)" opacity="0.82"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${m.from}"/>
      <stop offset="50%" stop-color="${m.to}"/>
      <stop offset="100%" stop-color="#06040c"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#E8C77E"/>
      <stop offset="100%" stop-color="#C9A24A"/>
    </linearGradient>
    <radialGradient id="sil" cx="50%" cy="30%" r="70%">
      <stop offset="0%" stop-color="${m.accent}" stop-opacity="0.65"/>
      <stop offset="55%" stop-color="${m.from}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#06040c" stop-opacity="1"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="22%" r="55%">
      <stop offset="0%" stop-color="${m.accent2}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
    <linearGradient id="face" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${m.accent}" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#0a0812" stop-opacity="0.85"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  ${motifLayer(m)}
  ${shoulders}
  <ellipse cx="200" cy="${headY}" rx="${headRx}" ry="${headRy}" fill="url(#face)" opacity="0.92"/>
  ${compact ? "" : `<text x="50%" y="92%" text-anchor="middle" font-family="Georgia, serif" font-size="${fontSize}" fill="url(#gold)" opacity="0.85">${m.monogram}</text>`}
  ${compact ? "" : `<text x="50%" y="97%" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" fill="url(#gold)" opacity="0.45">${m.label}</text>`}
  <rect x="6" y="6" width="${w - 12}" height="${h - 12}" fill="none" stroke="url(#gold)" stroke-width="2" opacity="0.5" rx="6"/>
  <rect x="12" y="12" width="${w - 24}" height="${h - 24}" fill="none" stroke="url(#gold)" stroke-width="0.8" opacity="0.2" rx="4"/>
</svg>`;
}

for (const m of masters) {
  writeFileSync(join(OUT, `${m.file}.svg`), portrait(m, 400, 520, 64, false));
  writeFileSync(join(OUT, `${m.file}-thumb.svg`), portrait(m, 120, 120, 24, true));
}

writeFileSync(join(OUT, "default.svg"), portrait(masters[1], 400, 520, 64, false));
writeFileSync(join(OUT, "default-thumb.svg"), portrait(masters[1], 120, 120, 24, true));

console.log("Generated master avatar placeholders in", OUT);
