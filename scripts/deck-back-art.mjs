/**
 * Premium programmatic deck backs (SVG → PNG via sharp).
 * Used when AI generation is unavailable or existing back is a tiny placeholder.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

export const MIN_DECK_BACK_BYTES = 55_000;

export function tarotVeronikaBackSvg(w = 520, h = 820) {
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#221a34"/>
      <stop offset="45%" stop-color="#140f22"/>
      <stop offset="100%" stop-color="#0a0712"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="55%">
      <stop offset="0%" stop-color="#E8C77E" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#E8C77E" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F2DCA0"/>
      <stop offset="50%" stop-color="#C9A24A"/>
      <stop offset="100%" stop-color="#8B6914"/>
    </linearGradient>
    <pattern id="dots" width="8" height="8" patternUnits="userSpaceOnUse">
      <circle cx="4" cy="4" r="0.6" fill="#E8C77E" opacity="0.08"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#dots)"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  <rect x="14" y="22" width="${w - 28}" height="${h - 44}" rx="18" fill="none" stroke="url(#gold)" stroke-width="2.2" opacity="0.85"/>
  <rect x="28" y="36" width="${w - 56}" height="${h - 72}" rx="12" fill="none" stroke="#E8C77E" stroke-width="1" opacity="0.35"/>
  <rect x="42" y="50" width="${w - 84}" height="${h - 100}" rx="8" fill="none" stroke="#C9A24A" stroke-width="0.8" opacity="0.22"/>
  ${cornerOrnament(w - 72, 68)}
  ${cornerOrnament(72, 68, true)}
  ${cornerOrnament(w - 72, h - 68, false, true)}
  ${cornerOrnament(72, h - 68, true, true)}
  <circle cx="${w / 2}" cy="${h * 0.46}" r="118" fill="none" stroke="#C9A24A" stroke-width="1.2" opacity="0.28"/>
  <circle cx="${w / 2}" cy="${h * 0.46}" r="98" fill="none" stroke="#E8C77E" stroke-width="0.8" opacity="0.22"/>
  <circle cx="${w / 2}" cy="${h * 0.46}" r="72" fill="none" stroke="url(#gold)" stroke-width="1.5" opacity="0.55"/>
  <g transform="translate(${w / 2} ${h * 0.46})" opacity="0.72">
    <path d="M0,-52 L12,-16 L50,-16 L18,8 L30,44 L0,20 L-30,44 L-18,8 L-50,-16 L-12,-16 Z" fill="none" stroke="url(#gold)" stroke-width="1.6"/>
    <circle cx="0" cy="0" r="14" fill="none" stroke="#E8C77E" stroke-width="1"/>
    <path d="M0,-28 C16,-8 16,8 0,28 C-16,8 -16,-8 0,-28 Z" fill="none" stroke="#C9A24A" stroke-width="0.9" opacity="0.8"/>
  </g>
  <g transform="translate(${w / 2} ${h * 0.72})" opacity="0.55">
    <ellipse cx="0" cy="0" rx="54" ry="18" fill="none" stroke="#E8C77E" stroke-width="0.9"/>
    <path d="M-34,0 C-18,-22 18,-22 34,0 C18,22 -18,22 -34,0 Z" fill="none" stroke="#C9A24A" stroke-width="0.8"/>
  </g>
  <text x="${w / 2}" y="${h - 36}" text-anchor="middle" font-family="Georgia, serif" font-size="11" letter-spacing="6" fill="#E8C77E" opacity="0.42">AURA</text>
</svg>`;
}

function cornerOrnament(x, y, flipX = false, flipY = false) {
  const sx = flipX ? -1 : 1;
  const sy = flipY ? -1 : 1;
  const tx = flipX ? x + 28 : x - 28;
  const ty = flipY ? y + 28 : y - 28;
  return `<g transform="translate(${tx} ${ty}) scale(${sx} ${sy})" opacity="0.5">
    <path d="M0,0 C18,0 28,10 28,28" fill="none" stroke="#C9A24A" stroke-width="1.1"/>
    <path d="M6,6 C14,6 18,10 18,18" fill="none" stroke="#E8C77E" stroke-width="0.7"/>
    <circle cx="24" cy="24" r="2.2" fill="#E8C77E" opacity="0.65"/>
  </g>`;
}

export async function writeProgrammaticBack(system, dest) {
  const sharp = (await import("sharp")).default;
  let svg;
  if (system === "tarot-veronika") {
    svg = tarotVeronikaBackSvg();
  } else {
    throw new Error(`No programmatic back for ${system}`);
  }
  await sharp(Buffer.from(svg)).png().toFile(dest);
  const tmp = dest + ".opt";
  await sharp(dest)
    .resize({ height: 800, fit: "inside", withoutEnlargement: true })
    .png({ quality: 90, compressionLevel: 9 })
    .toFile(tmp);
  fs.renameSync(tmp, dest);
}

export async function ensureTarotVeronikaBack() {
  const dest = path.join(ROOT, "public", "decks", "tarot-veronika", "_back.png");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await writeProgrammaticBack("tarot-veronika", dest);
  const size = fs.statSync(dest).size;
  console.log(`Created ${dest} (${size} bytes)`);
  return dest;
}

if (process.argv[1] && process.argv[1].includes("deck-back-art")) {
  ensureTarotVeronikaBack().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
