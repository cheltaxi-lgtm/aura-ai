#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "masters", "avatars");
mkdirSync(OUT, { recursive: true });

const masters = [
  { file: "ragnar", monogram: "R", from: "#1a2838", to: "#4a6a88", accent: "#94a3b8", accent2: "#e8c77e", motif: "runes" },
  { file: "veronika", monogram: "V", from: "#2a1438", to: "#5c2a52", accent: "#c084fc", accent2: "#e8c77e", motif: "tarot" },
  { file: "agafya", monogram: "А", from: "#1a2818", to: "#3d4a2a", accent: "#6b8f5e", accent2: "#d4a574", motif: "herbs" },
  { file: "shri-raj", monogram: "Ш", from: "#0f1a3d", to: "#1e3a6e", accent: "#f59e0b", accent2: "#e8c77e", motif: "stars" },
  { file: "marina", monogram: "M", from: "#1a1408", to: "#3d3018", accent: "#ec4899", accent2: "#e8c77e", motif: "moon" },
];

function silhouette(motif) {
  if (motif === "runes")
    return `<path d="M200 140c-28 0-50 32-50 72 0 48 50 120 50 120s50-72 50-120c0-40-22-72-50-72z" fill="url(#sil)" opacity="0.85"/>`;
  if (motif === "tarot")
    return `<ellipse cx="200" cy="200" rx="55" ry="68" fill="url(#sil)" opacity="0.82"/>`;
  if (motif === "herbs")
    return `<path d="M200 130c-32 8-48 40-48 78 0 52 48 124 48 124s48-72 48-124c0-38-16-70-48-78z" fill="url(#sil)" opacity="0.82"/>`;
  if (motif === "stars")
    return `<circle cx="200" cy="195" r="58" fill="url(#sil)" opacity="0.78"/>`;
  return `<ellipse cx="200" cy="200" rx="52" ry="65" fill="url(#sil)" opacity="0.8"/>`;
}

function portraitSvg(m, w, h, fontSize) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${m.from}"/>
      <stop offset="55%" stop-color="${m.to}"/>
      <stop offset="100%" stop-color="#08060e"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#E8C77E"/>
      <stop offset="100%" stop-color="#C9A24A"/>
    </linearGradient>
    <radialGradient id="sil" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="${m.accent}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#0a0812" stop-opacity="0.95"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="30%" r="50%">
      <stop offset="0%" stop-color="${m.accent2}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  ${silhouette(m.motif)}
  <text x="50%" y="88%" text-anchor="middle" font-family="Georgia, serif" font-size="${fontSize}" fill="url(#gold)" opacity="0.9">${m.monogram}</text>
  <rect x="8" y="8" width="${w - 16}" height="${h - 16}" fill="none" stroke="url(#gold)" stroke-width="1.5" opacity="0.45" rx="4"/>
</svg>`;
}

for (const m of masters) {
  writeFileSync(join(OUT, `${m.file}.svg`), portraitSvg(m, 400, 520, 72));
  writeFileSync(join(OUT, `${m.file}-thumb.svg`), portraitSvg(m, 120, 120, 28));
}

writeFileSync(join(OUT, "default.svg"), portraitSvg(masters[1], 400, 520, 72));
writeFileSync(join(OUT, "default-thumb.svg"), portraitSvg(masters[1], 120, 120, 28));

console.log("Generated master avatar placeholders in", OUT);
