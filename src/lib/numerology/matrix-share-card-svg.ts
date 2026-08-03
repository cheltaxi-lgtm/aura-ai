/**
 * Browser-safe SVG share card for destiny matrix (no sharp).
 */
import type { DestinyMatrixResult } from "./destiny-matrix";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type MatrixShareCardSvgInput = {
  matrix: DestinyMatrixResult;
  name?: string | null;
  birthDate?: string | null;
  /** Default false — do not put full DOB on share cards (PII). */
  includeBirthDate?: boolean;
};

/** 1080×1350 share card SVG for stories / download. */
export function buildMatrixShareCardSvg(input: MatrixShareCardSvgInput): string {
  const width = 1080;
  const height = 1350;
  const m = input.matrix;
  const name = input.name?.trim() || "";
  const date =
    input.includeBirthDate === true && input.birthDate?.trim()
      ? input.birthDate.trim()
      : "";
  const slots: Array<{ label: string; n: number; title: string }> = [
    { label: "Характер", n: m.body.number, title: m.body.arcanaName },
    { label: "Энергия", n: m.energy.number, title: m.energy.arcanaName },
    { label: "Комфорт", n: m.comfort.number, title: m.comfort.arcanaName },
    { label: "Таланты", n: m.talents.number, title: m.talents.arcanaName },
    { label: "Деньги", n: m.money.number, title: m.money.arcanaName },
    { label: "Отношения", n: m.relationships.number, title: m.relationships.arcanaName },
    { label: "Хвост", n: m.karmicTail[2].number, title: m.karmicTail[2].arcanaName },
    { label: "Год", n: m.yearArcana.number, title: m.yearArcana.arcanaName },
  ];

  const rows = slots
    .map((s, i) => {
      const y = 430 + i * 78;
      return [
        `<text x="120" y="${y}" font-family="Georgia, 'Times New Roman', serif" font-size="26" fill="rgba(232,196,120,0.85)">${escapeXml(s.label)}</text>`,
        `<text x="420" y="${y}" font-family="Georgia, 'Times New Roman', serif" font-size="36" font-weight="700" fill="#FFF6E0">${s.n}</text>`,
        `<text x="520" y="${y}" font-family="Georgia, 'Times New Roman', serif" font-size="28" fill="#F8F2FF">${escapeXml(s.title)}</text>`,
      ].join("");
    })
    .join("");

  const nameLine = name
    ? `<text x="50%" y="210" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="28" fill="rgba(232,196,120,0.9)">${escapeXml(name)}</text>`
    : "";
  const dateLine = date
    ? `<text x="50%" y="255" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="22" fill="rgba(255,255,255,0.45)">${escapeXml(date)}</text>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="28%" r="80%">
      <stop offset="0%" stop-color="#2C1A4A"/>
      <stop offset="55%" stop-color="#151028"/>
      <stop offset="100%" stop-color="#080612"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="40" y="40" width="${width - 80}" height="${height - 80}" rx="28" fill="none" stroke="rgba(201,162,74,0.28)" stroke-width="1.5"/>
  <text x="50%" y="110" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="18" letter-spacing="5" fill="#C9A24A">ZOVUS</text>
  <text x="50%" y="170" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="40" fill="#F8F2FF">Матрица судьбы</text>
  ${nameLine}
  ${dateLine}
  <line x1="160" y1="300" x2="${width - 160}" y2="300" stroke="rgba(196,160,255,0.22)" stroke-width="1"/>
  <text x="50%" y="360" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="18" letter-spacing="3" fill="rgba(232,196,120,0.75)">КЛЮЧЕВЫЕ ТОЧКИ</text>
  ${rows}
  <text x="50%" y="${height - 70}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="16" fill="rgba(255,255,255,0.35)">полная матрица · zovus.ru</text>
</svg>`;
}

/** Trigger browser download of the share card as .svg */
export function downloadMatrixShareCardSvg(input: MatrixShareCardSvgInput): void {
  if (typeof document === "undefined") return;
  const svg = buildMatrixShareCardSvg(input);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = (input.name || "matrix").replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 40);
  a.download = `zovus-matrix-${stamp || "share"}.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
