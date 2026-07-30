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

function trunc(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

export type RuneShopPackage = {
  name: string;
  totalRunes: number;
  stars: number;
  bonusRunes?: number;
  isPopular?: boolean;
};

export type RuneShopCardInput = {
  balance: number;
  packages: RuneShopPackage[];
};

/**
 * Ornate rune vault card — same canvas language as profile / matrix plates.
 */
export async function renderRuneShopCardImage(p: RuneShopCardInput): Promise<Buffer> {
  const width = BOT_CANVAS_WIDTH;
  const height = BOT_CANVAS_HEIGHT;
  const packages = p.packages.slice(0, 4);
  const nodes: string[] = [];
  let y = 118;

  nodes.push(
    `<text x="50%" y="${y}" text-anchor="middle"
      font-family="${FONT}" font-size="18" letter-spacing="8" fill="#C4A574">РУНЫ</text>`
  );
  y += 64;

  nodes.push(
    `<text x="50%" y="${y}" text-anchor="middle"
      font-family="${FONT}" font-size="22" letter-spacing="4" fill="#8A7349">БАЛАНС</text>`
  );
  y += 70;

  nodes.push(
    `<text x="50%" y="${y}" text-anchor="middle"
      font-family="${FONT}" font-size="78" fill="#F5EDE3">${escapeXml(String(p.balance))}</text>`
  );
  y += 40;

  nodes.push(
    `<text x="50%" y="${y}" text-anchor="middle"
      font-family="${FONT}" font-size="22" letter-spacing="4" fill="#A89068">рун · наполнение салона</text>`
  );
  y += 40;

  nodes.push(
    `<line x1="${width * 0.22}" y1="${y}" x2="${width * 0.78}" y2="${y}"
      stroke="#C4A574" stroke-opacity="0.5" stroke-width="2"/>`
  );
  y += 44;

  nodes.push(
    `<text x="50%" y="${y}" text-anchor="middle"
      font-family="${FONT}" font-size="18" letter-spacing="5" fill="#8A7349">НАПОЛНЕНИЕ</text>`
  );
  y += 36;

  const cardW = Math.floor(width * 0.72);
  const cardH = 118;
  const gap = 18;
  const left = Math.floor((width - cardW) / 2);

  if (packages.length === 0) {
    nodes.push(
      `<text x="50%" y="${y + 60}" text-anchor="middle"
        font-family="${FONT}" font-size="26" fill="#A89068">Пакеты временно недоступны</text>`
    );
  }

  packages.forEach((pkg, i) => {
    const ty = y + i * (cardH + gap);
    if (ty + cardH > height - 100) return;
    const strokeOp = pkg.isPopular ? "0.85" : "0.35";
    const fill = pkg.isPopular ? "#1F1814" : "#1A1512";
    const name = trunc(pkg.name, 22);
    const runes = `${pkg.totalRunes} рун`;
    const stars = `${pkg.stars} Stars`;
    const mark = pkg.isPopular ? "выбор" : "";

    nodes.push(
      `<rect x="${left}" y="${ty}" width="${cardW}" height="${cardH}"
        fill="${fill}" stroke="#C4A574" stroke-opacity="${strokeOp}" stroke-width="1.5" rx="10"/>`,
      `<text x="${left + 36}" y="${ty + 48}" text-anchor="start"
        font-family="${FONT}" font-size="30" fill="#F5EDE3">${escapeXml(name)}</text>`,
      `<text x="${left + 36}" y="${ty + 86}" text-anchor="start"
        font-family="${FONT}" font-size="22" fill="#A89068">${escapeXml(runes)}</text>`,
      `<text x="${left + cardW - 36}" y="${ty + 48}" text-anchor="end"
        font-family="${FONT}" font-size="26" fill="#C4A574">${escapeXml(stars)}</text>`
    );
    if (mark) {
      nodes.push(
        `<text x="${left + cardW - 36}" y="${ty + 86}" text-anchor="end"
          font-family="${FONT}" font-size="18" letter-spacing="3" fill="#8A7349">${escapeXml(
            mark
          )}</text>`
      );
    }
  });

  nodes.push(
    `<text x="50%" y="${height - 72}" text-anchor="middle"
      font-family="${FONT}" font-size="20" fill="#8A7349">Stars в Telegram · карта в кабинете</text>`,
    `<text x="50%" y="${height - 40}" text-anchor="middle"
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
