import sharp from "sharp";
import {
  BOT_CANVAS_HEIGHT,
  BOT_CANVAS_WIDTH,
  encodeBotJpeg,
  getOrnatePlate,
} from "./canvas.js";

const FONT = "DejaVu Serif, Georgia, 'Times New Roman', serif";

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
 * Premium Zovus profile card — site-synced stats on the shared ornate canvas.
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

  const nodes: string[] = [];
  let y = 118;

  nodes.push(
    `<text x="50%" y="${y}" text-anchor="middle"
      font-family="${FONT}" font-size="18" letter-spacing="6" fill="#C4A574">ПРОФИЛЬ</text>`
  );
  y += 56;

  nodes.push(
    `<text x="50%" y="${y}" text-anchor="middle"
      font-family="${FONT}" font-size="52" fill="#F5EDE3">${escapeXml(name)}</text>`
  );
  y += 48;

  nodes.push(
    `<text x="50%" y="${y}" text-anchor="middle"
      font-family="${FONT}" font-size="20" letter-spacing="3" fill="#A89068">${escapeXml(
      access
    )}</text>`
  );
  y += 36;

  nodes.push(
    `<line x1="${width * 0.22}" y1="${y}" x2="${width * 0.78}" y2="${y}"
      stroke="#C4A574" stroke-opacity="0.5" stroke-width="2"/>`
  );
  y += 48;

  // Stat tiles — 2×2
  const tileW = 400;
  const tileH = 120;
  const gapX = 36;
  const gapY = 28;
  const gridW = tileW * 2 + gapX;
  const left0 = Math.floor((width - gridW) / 2);

  rows.forEach((row, i) => {
    const col = i % 2;
    const r = Math.floor(i / 2);
    const x = left0 + col * (tileW + gapX);
    const ty = y + r * (tileH + gapY);
    nodes.push(
      `<rect x="${x}" y="${ty}" width="${tileW}" height="${tileH}"
        fill="#1A1512" stroke="#C4A574" stroke-opacity="0.35" stroke-width="1.5" rx="10"/>`,
      `<text x="${x + tileW / 2}" y="${ty + 42}" text-anchor="middle"
        font-family="${FONT}" font-size="18" letter-spacing="3" fill="#8A7349">${escapeXml(
        row.label
      )}</text>`,
      `<text x="${x + tileW / 2}" y="${ty + 92}" text-anchor="middle"
        font-family="${FONT}" font-size="44" fill="#F5EDE3">${escapeXml(row.value)}</text>`
    );
  });

  y += 2 * (tileH + gapY) + 20;

  nodes.push(
    `<line x1="${width * 0.28}" y1="${y}" x2="${width * 0.72}" y2="${y}"
      stroke="#C4A574" stroke-opacity="0.35" stroke-width="1.5"/>`
  );
  y += 44;

  for (const d of details.slice(0, 8)) {
    nodes.push(
      `<text x="${width * 0.18}" y="${y}" text-anchor="start"
        font-family="${FONT}" font-size="24" fill="#A89068">${escapeXml(d.label)}</text>`,
      `<text x="${width * 0.82}" y="${y}" text-anchor="end"
        font-family="${FONT}" font-size="26" fill="#F5EDE3">${escapeXml(d.value)}</text>`
    );
    y += 44;
    if (y > height - 90) break;
  }

  nodes.push(
    `<text x="50%" y="${height - 48}" text-anchor="middle"
      font-family="${FONT}" font-size="18" letter-spacing="4" fill="#8A7349">zovus.ru</text>`
  );

  const overlaySvg = Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      ${nodes.join("\n")}
    </svg>`
  );

  const plate = await getOrnatePlate();
  return encodeBotJpeg(sharp(plate).composite([{ input: overlaySvg }]));
}
