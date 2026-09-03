/**
 * Aura SEO URL family for IndexNow / Yandex recrawl.
 * Slugs are read from the product source (aura-content / articles-aura) so
 * scripts never drift from getAllAuraSeoPaths().
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function slugsInExport(src, exportName) {
  const start = src.indexOf(`export const ${exportName}`);
  if (start < 0) return [];
  const next = src.indexOf("export const ", start + "export const ".length);
  const block = src.slice(start, next > 0 ? next : undefined);
  return [...block.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
}

export function getAuraSeoPaths() {
  const src = readFileSync(join(ROOT, "src/lib/seo/aura-content.ts"), "utf8");
  const colors = slugsInExport(src, "AURA_COLOR_SEO");
  const chakras = slugsInExport(src, "AURA_CHAKRA_SEO");
  const layers = slugsInExport(src, "AURA_LAYER_SEO");
  const intents = slugsInExport(src, "AURA_INTENT_SEO");
  return [
    "/aura",
    "/aura/besplatno",
    "/aura/cveta",
    ...colors.map((s) => `/aura/cveta/${s}`),
    "/aura/chakry",
    ...chakras.map((s) => `/aura/chakry/${s}`),
    "/aura/sloi",
    ...layers.map((s) => `/aura/sloi/${s}`),
    ...intents.map((s) => `/aura/${s}`),
  ];
}

export function getAuraArticlePaths() {
  const src = readFileSync(join(ROOT, "src/lib/seo/articles-aura.ts"), "utf8");
  return [...src.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => `/statyi/${m[1]}`);
}

export function auraAbsoluteUrls(base) {
  const root = String(base || "").replace(/\/$/, "");
  return [...getAuraSeoPaths(), ...getAuraArticlePaths()].map((p) => `${root}${p}`);
}
