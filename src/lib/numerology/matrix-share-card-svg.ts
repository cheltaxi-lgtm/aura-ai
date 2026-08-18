/**
 * Browser-safe SVG share card for destiny matrix (no sharp).
 */
import type { DestinyMatrixResult } from "./destiny-matrix";
import { buildMatrixDiagramSvgFromResult } from "./matrix-diagram-svg";

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
  const name = input.name?.trim() || "";
  const date =
    input.includeBirthDate === true && input.birthDate?.trim()
      ? input.birthDate.trim()
      : "";

  const nameLine = name
    ? `<text x="50%" y="168" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="26" fill="rgba(232,196,120,0.9)">${escapeXml(name)}</text>`
    : "";
  const dateLine = date
    ? `<text x="50%" y="202" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="20" fill="rgba(237,230,218,0.45)">${escapeXml(date)}</text>`
    : "";

  const diagram = buildMatrixDiagramSvgFromResult(input.matrix, {
    theme: "dark",
    density: "full",
    showPeriod: false,
    uid: "share",
    fragment: true,
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0a0908"/>
  <rect x="36" y="36" width="${width - 72}" height="${height - 72}" rx="28" fill="none" stroke="rgba(201,162,74,0.28)" stroke-width="1.5"/>
  <text x="50%" y="88" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="16" letter-spacing="6" fill="#C9A24A">ZOVUS</text>
  <text x="50%" y="132" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="36" fill="#EDE6DA">Матрица судьбы</text>
  ${nameLine}
  ${dateLine}
  <svg x="40" y="214" width="1000" height="1060" viewBox="0 0 1000 1200">
    ${diagram}
  </svg>
  <text x="50%" y="${height - 56}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="16" fill="rgba(237,230,218,0.35)">22 аркана · zovus.ru</text>
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
