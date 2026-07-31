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

function formatDate(iso: string | null | undefined): string {
  const d = (iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "—";
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
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

export type ProfileCardInput = {
  name: string;
  linked: boolean;
  unlimited?: boolean;
  zodiac?: string | null;
  birthDate?: string | null;
  memberSince?: string | null;
  runeBalance: number;
  totalSessions: number;
  totalCards: number;
  daysWithUs: number;
  favoriteMasterName?: string | null;
  natalLabel?: string | null;
  matrices: number;
  photos: number;
  rituals: number;
  timezone?: string | null;
  streak?: number | null;
};

/**
 * Profile card — same honey field as salon home (brand parity).
 */
export async function renderProfileCardImage(p: ProfileCardInput): Promise<Buffer> {
  const width = BOT_CANVAS_WIDTH;
  const height = BOT_CANVAS_HEIGHT;
  const name = trunc(p.name || "Гость", 28);
  const access = !p.linked
    ? "АККАУНТ НЕ ПРИВЯЗАН"
    : p.unlimited
      ? "БЕЗЛИМИТ ZOVUS"
      : "АККАУНТ ZOVUS";

  const rows: Array<{ label: string; value: string }> = [
    { label: "РУНЫ", value: String(p.runeBalance) },
    { label: "РАСКЛАДЫ", value: String(p.totalSessions) },
    { label: "КАРТЫ", value: String(p.totalCards) },
    { label: "С НАМИ", value: `${p.daysWithUs} дн.` },
  ];

  const details: Array<{ label: string; value: string }> = [];
  if (p.zodiac) details.push({ label: "Знак", value: p.zodiac });
  if (p.birthDate) details.push({ label: "Дата рождения", value: formatDate(p.birthDate) });
  if (p.favoriteMasterName) {
    details.push({ label: "Любимый мастер", value: p.favoriteMasterName });
  }
  if (p.natalLabel) details.push({ label: "Натал", value: p.natalLabel });
  details.push({ label: "Матрицы", value: String(p.matrices) });
  details.push({ label: "Фото-расклады", value: String(p.photos) });
  details.push({ label: "Обряды", value: String(p.rituals) });
  if (p.memberSince) {
    details.push({ label: "С нами с", value: formatDate(p.memberSince) });
  }
  if (p.timezone) details.push({ label: "Пояс", value: trunc(p.timezone, 36) });
  if (p.streak != null && p.streak > 0) {
    details.push({ label: "Серия", value: `${p.streak} дн.` });
  }

  const tileW = 360;
  const tileH = 110;
  const gapX = 28;
  const gapY = 22;
  const gridW = tileW * 2 + gapX;
  const left0 = Math.floor((width - gridW) / 2);
  const tilesTop = 420;

  const tileNodes = rows
    .map((row, i) => {
      const col = i % 2;
      const r = Math.floor(i / 2);
      const x = left0 + col * (tileW + gapX);
      const ty = tilesTop + r * (tileH + gapY);
      return `
      <rect x="${x}" y="${ty}" width="${tileW}" height="${tileH}"
        fill="url(#chipFill)" stroke="#5A3210" stroke-opacity="0.45" stroke-width="2" rx="16"/>
      <text x="${x + tileW / 2}" y="${ty + 40}" text-anchor="middle"
        font-family="${FONT}" font-size="18" fill="#5A3210">${escapeXml(row.label)}</text>
      <text x="${x + tileW / 2}" y="${ty + 86}" text-anchor="middle"
        font-family="${FONT}" font-size="40" fill="#1E1008">${escapeXml(row.value)}</text>`;
    })
    .join("\n");

  let detailY = tilesTop + 2 * (tileH + gapY) + 36;
  const detailNodes = details
    .slice(0, 7)
    .map((d) => {
      const y = detailY;
      detailY += 40;
      if (y > height - 100) return "";
      return `
      <text x="${CONTENT}" y="${y}" text-anchor="start"
        font-family="${FONT}" font-size="22" fill="#5A3210">${escapeXml(d.label)}</text>
      <text x="${width - CONTENT}" y="${y}" text-anchor="end"
        font-family="${FONT}" font-size="24" fill="#1E1008">${escapeXml(d.value)}</text>`;
    })
    .join("\n");

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
    font-family="${FONT}" font-size="28" fill="#5A3210">ПРОФИЛЬ</text>
  <text x="50%" y="270" text-anchor="middle"
    font-family="${FONT}" font-size="52" fill="#1E1008">${escapeXml(name)}</text>
  <text x="50%" y="320" text-anchor="middle"
    font-family="${FONT}" font-size="22" fill="#6B3E14">${escapeXml(access)}</text>

  <line x1="${width * 0.28}" y1="360" x2="${width * 0.72}" y2="360"
    stroke="#5A3210" stroke-opacity="0.35" stroke-width="2"/>

  ${tileNodes}
  ${detailNodes}

  <text x="50%" y="${height - 56}" text-anchor="middle"
    font-family="${FONT}" font-size="20" fill="#5A3210">zovus.ru</text>
</svg>`);

  const png = await sharp(svg).png().toBuffer();
  return encodeBotJpeg(sharp(png).resize(width, height, { fit: "fill" }));
}
