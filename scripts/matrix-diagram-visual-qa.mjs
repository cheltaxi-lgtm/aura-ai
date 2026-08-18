/**
 * Render canonical Matrix SVGs and screenshot desktop/mobile/print.
 * Usage: npx tsx scripts/matrix-diagram-visual-qa.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { destinyMatrix } from "../src/lib/numerology/destiny-matrix.ts";
import { buildMatrixDiagramSvgFromResult } from "../src/lib/numerology/matrix-diagram-svg.ts";
import { buildMatrixShareCardSvg } from "../src/lib/numerology/matrix-share-card-svg.ts";

const OUT = path.resolve("test-artifacts/matrix-qa");
mkdirSync(OUT, { recursive: true });

const DATES = [
  ["1979-09-18", "mixed"],
  ["2001-01-11", "eleven"],
  ["2000-11-22", "twenty-two"],
  ["2010-06-25", "child"],
];

const pages = DATES.map(([birth, slug]) => {
  const matrix = destinyMatrix(birth, { asOfDate: "2026-08-18" });
  if (!matrix) throw new Error(`null matrix ${birth}`);
  const dark = buildMatrixDiagramSvgFromResult(matrix, { theme: "dark", uid: slug });
  const print = buildMatrixDiagramSvgFromResult(matrix, { theme: "print", uid: `${slug}-print` });
  const share = buildMatrixShareCardSvg({ matrix, name: "QA", includeBirthDate: false });
  writeFileSync(path.join(OUT, `${slug}-dark.svg`), dark);
  writeFileSync(path.join(OUT, `${slug}-print.svg`), print);
  writeFileSync(path.join(OUT, `${slug}-share.svg`), share);
  return { birth, slug, dark, print };
});

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Matrix QA</title>
<style>
  body { margin:0; background:#0a0908; color:#ede6da; font-family: Georgia, serif; }
  section { padding: 16px; }
  h1 { font-size: 18px; font-weight: 600; }
  .frame { width: 100%; max-width: 36rem; margin: 0 auto; }
  .frame svg { width: 100%; height: auto; display: block; }
</style></head><body>
${pages
  .map(
    (p) => `<section data-qa="${p.slug}">
  <h1>${p.birth}</h1>
  <div class="frame">${p.dark}</div>
</section>`
  )
  .join("\n")}
<section data-qa="print">
  <h1>print 1979-09-18</h1>
  <div class="frame">${pages[0].print}</div>
</section>
</body></html>`;

const htmlPath = path.join(OUT, "index.html");
writeFileSync(htmlPath, html);

const browser = await chromium.launch();
const viewports = [
  ["desktop", { width: 1280, height: 1600 }],
  ["390", { width: 390, height: 1400 }],
  ["375", { width: 375, height: 1400 }],
  ["430", { width: 430, height: 1400 }],
  ["360", { width: 360, height: 1400 }],
  ["320", { width: 320, height: 1400 }],
  ["tablet", { width: 768, height: 1400 }],
];

for (const [name, viewport] of viewports) {
  const page = await browser.newPage({ viewport });
  await page.goto(`file://${htmlPath.replace(/\\/g, "/")}`);
  await page.screenshot({
    path: path.join(OUT, `qa-${name}.png`),
    fullPage: true,
  });
  await page.close();
}

const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
await page.setContent(
  `<html><body style="margin:0">${pages[0].dark}</body></html>`,
  { waitUntil: "load" }
);
await page.screenshot({ path: path.join(OUT, "result-1979.png") });
await browser.close();
console.log(`OK matrix visual QA → ${OUT}`);
