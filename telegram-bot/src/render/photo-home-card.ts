import sharp from "sharp";
import {
  BOT_CANVAS_HEIGHT,
  BOT_CANVAS_WIDTH,
  encodeBotJpeg,
} from "./canvas.js";

const FONT = "DejaVu Serif, Georgia, 'Times New Roman', serif";

/** Same safe margins as salon home — Telegram bubble rounds corners. */
const FRAME = 120;
const CONTENT = 148;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

/**
 * Photo-rasklad home / await — same honey daylight language as salon home.
 */
export async function renderPhotoHomeCardImage(opts: {
  cost: number;
  balance?: number | null;
  firstDiscount?: boolean;
  historyCount?: number;
  mode?: "home" | "await";
}): Promise<Buffer> {
  const width = BOT_CANVAS_WIDTH;
  const height = BOT_CANVAS_HEIGHT;
  const mode = opts.mode || "home";
  const cost = Math.max(0, Math.floor(opts.cost));
  const bal =
    typeof opts.balance === "number" && Number.isFinite(opts.balance)
      ? Math.max(0, Math.floor(opts.balance))
      : null;
  const historyCount = Math.max(0, Math.floor(opts.historyCount || 0));

  const pillars =
    mode === "await"
      ? [
          { title: "ФОТО", sub: "чёткий снимок" },
          { title: "КАРТЫ", sub: "распознаем" },
          { title: "РАЗБОР", sub: "после подтверждения" },
        ]
      : [
          { title: "СНИМОК", sub: "готового расклада" },
          { title: "ПРОВЕРКА", sub: "названия карт" },
          { title: "РАЗБОР", sub: `${cost}ᚢ расшифровка` },
        ];

  const colGap = 14;
  const innerW = width - CONTENT * 2;
  const colW = Math.floor((innerW - colGap * 2) / 3);
  const colLeft = CONTENT;
  const colY = 760;
  const colH = 148;

  const tiles = pillars
    .map((p, i) => {
      const x = colLeft + i * (colW + colGap);
      return `
      <rect x="${x}" y="${colY}" width="${colW}" height="${colH}"
        fill="url(#chipFill)" stroke="#5A3210" stroke-opacity="0.45" stroke-width="2" rx="18"/>
      <text x="${x + colW / 2}" y="${colY + 64}" text-anchor="middle"
        font-family="${FONT}" font-size="30" fill="#2A1608">${escapeXml(p.title)}</text>
      <text x="${x + colW / 2}" y="${colY + 110}" text-anchor="middle"
        font-family="${FONT}" font-size="22" fill="#5A3210">${escapeXml(p.sub)}</text>`;
    })
    .join("\n");

  const heroTop = 320;
  const heroLines =
    mode === "await"
      ? ["Пришлите", "фото расклада"]
      : ["Фото", "готового расклада"];

  const dealLine = opts.firstDiscount
    ? "Первая расшифровка — со скидкой 50%"
    : `Расшифровка · ${cost}ᚢ`;
  const balLine = bal != null ? `Баланс · ${bal}ᚢ` : "Распознавание бесплатно";
  const histLine =
    mode === "home" && historyCount > 0
      ? `Архив выше · ${historyCount}`
      : mode === "await"
        ? "Вопрос — в подписи или сообщением"
        : "Сделайте первый снимок";
  const ctaLine =
    mode === "await" ? "Жду снимок" : "Нажмите «Новый расклад»";

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
  <ellipse cx="${width / 2}" cy="300" rx="480" ry="380" fill="url(#homeGlow)"/>
  ${goldFrame(width, height)}

  <text x="50%" y="196" text-anchor="middle"
    font-family="${FONT}" font-size="34" fill="#5A3210">ZOVUS</text>
  <text x="50%" y="238" text-anchor="middle"
    font-family="${FONT}" font-size="22" fill="#6B3E14">РАСКЛАД ПО ФОТО</text>

  <text x="50%" y="${heroTop}" text-anchor="middle"
    font-family="${FONT}" font-size="78" fill="#1E1008">${escapeXml(heroLines[0]!)}</text>
  <text x="50%" y="${heroTop + 88}" text-anchor="middle"
    font-family="${FONT}" font-size="78" fill="#1E1008">${escapeXml(heroLines[1]!)}</text>

  <text x="50%" y="${heroTop + 160}" text-anchor="middle"
    font-family="${FONT}" font-size="28" fill="#5A3210">${escapeXml(dealLine)}</text>
  <text x="50%" y="${heroTop + 208}" text-anchor="middle"
    font-family="${FONT}" font-size="26" fill="#5A3210">${escapeXml(balLine)}</text>

  <line x1="${CONTENT + 20}" y1="${heroTop + 248}" x2="${width - CONTENT - 20}" y2="${heroTop + 248}"
    stroke="#5A3210" stroke-opacity="0.35" stroke-width="2.5"/>

  ${tiles}

  <text x="50%" y="${height - 220}" text-anchor="middle"
    font-family="${FONT}" font-size="34" fill="#1E1008">${escapeXml(ctaLine)}</text>
  <text x="50%" y="${height - 174}" text-anchor="middle"
    font-family="${FONT}" font-size="24" fill="#5A3210">${escapeXml(histLine)}</text>
  <text x="50%" y="${height - 132}" text-anchor="middle"
    font-family="${FONT}" font-size="20" fill="#6B3E14">zovus.ru</text>
</svg>`);

  const png = await sharp(svg).png().toBuffer();
  return encodeBotJpeg(sharp(png).resize(width, height, { fit: "fill" }));
}
