import sharp from "sharp";
import {
  BOT_CANVAS_HEIGHT,
  BOT_CANVAS_WIDTH,
  encodeBotJpeg,
} from "./canvas.js";

const FONT = "DejaVu Serif, Georgia, 'Times New Roman', serif";

/** Match salon-home honey plate margins. */
const FRAME = 120;
const CONTENT = 148;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function trunc(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

function goldFrame(width: number, height: number): string {
  const o = FRAME;
  const i = FRAME + 14;
  const c = 40;
  return `
    <rect x="${o}" y="${o}" width="${width - o * 2}" height="${height - o * 2}"
      fill="none" stroke="#6B3E14" stroke-opacity="0.55" stroke-width="3" rx="16"/>
    <rect x="${i}" y="${i}" width="${width - i * 2}" height="${height - i * 2}"
      fill="none" stroke="#8B5A22" stroke-opacity="0.35" stroke-width="1.5" rx="12"/>
    <path d="M${o} ${o + c} V${o} H${o + c}" fill="none" stroke="#5A3210" stroke-width="5" stroke-linecap="square"/>
    <path d="M${width - o - c} ${o} H${width - o} V${o + c}" fill="none" stroke="#5A3210" stroke-width="5" stroke-linecap="square"/>
    <path d="M${o} ${height - o - c} V${height - o} H${o + c}" fill="none" stroke="#5A3210" stroke-width="5" stroke-linecap="square"/>
    <path d="M${width - o - c} ${height - o} H${width - o} V${height - o - c}" fill="none" stroke="#5A3210" stroke-width="5" stroke-linecap="square"/>
  `;
}

export type RuneShopPackage = {
  name: string;
  totalRunes: number;
  priceRub: number;
  bonusRunes?: number;
  isPopular?: boolean;
};

export type RuneShopCardInput = {
  balance: number;
  packages: RuneShopPackage[];
  /** Show «Своя сумма» chip under packages. */
  customAmount?: boolean;
  minCustomRub?: number;
};

/**
 * Rune shop card — honey field like salon home; prices in ₽ (YooKassa).
 */
export async function renderRuneShopCardImage(p: RuneShopCardInput): Promise<Buffer> {
  const width = BOT_CANVAS_WIDTH;
  const height = BOT_CANVAS_HEIGHT;
  const packages = p.packages.slice(0, 4);

  const cardW = width - CONTENT * 2;
  const cardH = 110;
  const gap = 16;
  const left = CONTENT;
  const listTop = 500;
  const showCustom = p.customAmount !== false;
  const minCustom = Math.max(0, Math.round(p.minCustomRub ?? 100));

  /** Filled gold star (popular mark) — no word «выбор». */
  function goldStar(cx: number, cy: number, r = 14): string {
    const pts: string[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (-Math.PI / 2 + (i * 2 * Math.PI) / 5);
      const b = a + Math.PI / 5;
      pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
      pts.push(`${cx + r * 0.4 * Math.cos(b)},${cy + r * 0.4 * Math.sin(b)}`);
    }
    return `<polygon points="${pts.join(" ")}" fill="#C9A227" stroke="#8B6914" stroke-width="1"/>`;
  }

  let packageNodes = "";
  if (packages.length === 0 && !showCustom) {
    packageNodes = `
      <text x="50%" y="${listTop + 60}" text-anchor="middle"
        font-family="${FONT}" font-size="26" fill="#5A3210">Пакеты временно недоступны</text>`;
  } else {
    packageNodes = packages
      .map((pkg, i) => {
        const ty = listTop + i * (cardH + gap);
        if (ty + cardH > height - 160) return "";
        const name = trunc(pkg.name, 22);
        const runes = `${pkg.totalRunes} рун`;
        const rub = `${Math.max(0, Math.round(pkg.priceRub || 0))} ₽`;
        const strokeOp = pkg.isPopular ? "0.7" : "0.45";
        const mark = pkg.isPopular ? goldStar(left + cardW - 36, ty + 78, 13) : "";
        return `
      <rect x="${left}" y="${ty}" width="${cardW}" height="${cardH}"
        fill="url(#chipFill)" stroke="#5A3210" stroke-opacity="${strokeOp}" stroke-width="2" rx="16"/>
      <text x="${left + 32}" y="${ty + 46}" text-anchor="start"
        font-family="${FONT}" font-size="28" fill="#1E1008">${escapeXml(name)}</text>
      <text x="${left + 32}" y="${ty + 82}" text-anchor="start"
        font-family="${FONT}" font-size="22" fill="#5A3210">${escapeXml(runes)}</text>
      <text x="${left + cardW - 28}" y="${ty + 46}" text-anchor="end"
        font-family="${FONT}" font-size="26" fill="#3A220E">${escapeXml(rub)}</text>
      ${mark}`;
      })
      .join("\n");

    if (showCustom) {
      const ty = listTop + packages.length * (cardH + gap);
      if (ty + cardH <= height - 140) {
        packageNodes += `
      <rect x="${left}" y="${ty}" width="${cardW}" height="${cardH}"
        fill="url(#chipFill)" stroke="#5A3210" stroke-opacity="0.45" stroke-width="2" rx="16"/>
      <text x="${left + 32}" y="${ty + 46}" text-anchor="start"
        font-family="${FONT}" font-size="28" fill="#1E1008">Своя сумма</text>
      <text x="${left + 32}" y="${ty + 82}" text-anchor="start"
        font-family="${FONT}" font-size="22" fill="#5A3210">от ${minCustom} ₽</text>
      <text x="${left + cardW - 28}" y="${ty + 64}" text-anchor="end"
        font-family="${FONT}" font-size="24" fill="#3A220E">₽</text>`;
      }
    }
  }

  const svg = Buffer.from(`
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="homeBg" cx="50%" cy="30%" r="92%">
      <stop offset="0%" stop-color="#FFF6D8"/>
      <stop offset="20%" stop-color="#F5D890"/>
      <stop offset="48%" stop-color="#E0B060"/>
      <stop offset="78%" stop-color="#C49048"/>
      <stop offset="100%" stop-color="#A07030"/>
    </radialGradient>
    <radialGradient id="homeGlow" cx="50%" cy="24%" r="50%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.85"/>
      <stop offset="40%" stop-color="#FFF4C8" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#F5D890" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="chipFill" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFF8E8"/>
      <stop offset="100%" stop-color="#F0C870"/>
    </linearGradient>
  </defs>

  <rect width="100%" height="100%" fill="url(#homeBg)"/>
  <ellipse cx="${width / 2}" cy="280" rx="480" ry="320" fill="url(#homeGlow)"/>
  ${goldFrame(width, height)}

  <text x="50%" y="196" text-anchor="middle"
    font-family="${FONT}" font-size="28" fill="#5A3210">РУНЫ</text>
  <text x="50%" y="238" text-anchor="middle"
    font-family="${FONT}" font-size="22" fill="#6B3E14">НАПОЛНЕНИЕ САЛОНА</text>

  <text x="50%" y="320" text-anchor="middle"
    font-family="${FONT}" font-size="22" fill="#5A3210">БАЛАНС</text>
  <text x="50%" y="410" text-anchor="middle"
    font-family="${FONT}" font-size="88" fill="#1E1008">${escapeXml(String(p.balance))}</text>
  <text x="50%" y="458" text-anchor="middle"
    font-family="${FONT}" font-size="24" fill="#5A3210">рун · zovus.ru</text>

  <line x1="${CONTENT + 20}" y1="486" x2="${width - CONTENT - 20}" y2="486"
    stroke="#5A3210" stroke-opacity="0.35" stroke-width="2.5"/>

  ${packageNodes}

  <text x="50%" y="${height - 72}" text-anchor="middle"
    font-family="${FONT}" font-size="22" fill="#3A220E">Оплата картой · ЮKassa</text>
  <text x="50%" y="${height - 36}" text-anchor="middle"
    font-family="${FONT}" font-size="18" fill="#6B3E14">18+ · zovus.ru</text>
</svg>`);

  const png = await sharp(svg).png().toBuffer();
  return encodeBotJpeg(sharp(png).resize(width, height, { fit: "fill" }));
}
