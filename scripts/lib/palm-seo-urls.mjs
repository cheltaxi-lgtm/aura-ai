/**
 * Palm SEO URL family for IndexNow / Yandex recrawl.
 * Slugs are read from the product source so scripts never drift from getAllPalmSeoPaths().
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function valuesInConst(src, name) {
  const start = src.indexOf(`const ${name}`);
  if (start < 0) return [];
  const next = src.indexOf("const ", start + "const ".length);
  const block = src.slice(start, next > 0 ? next : undefined);
  return [...block.matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]);
}

export function getPalmSeoPaths() {
  const src = readFileSync(join(ROOT, "src/lib/seo/palm-content.ts"), "utf8");
  const lines = valuesInConst(src, "LINE_SLUGS");
  const mounts = valuesInConst(src, "MOUNT_SLUGS");
  const shapes = valuesInConst(src, "SHAPE_SLUGS");
  const marks = valuesInConst(src, "MARK_SLUGS");
  const intents = valuesInConst(src, "INTENT_SLUGS");
  return [
    "/gadanie-po-ladoni",
    "/gadanie-po-ladoni/linii",
    ...lines.map((s) => `/gadanie-po-ladoni/linii/${s}`),
    "/gadanie-po-ladoni/kholmy",
    ...mounts.map((s) => `/gadanie-po-ladoni/kholmy/${s}`),
    "/gadanie-po-ladoni/tipy-ruk",
    ...shapes.map((s) => `/gadanie-po-ladoni/tipy-ruk/${s}`),
    "/gadanie-po-ladoni/znaki",
    ...marks.map((s) => `/gadanie-po-ladoni/znaki/${s}`),
    ...intents.map((s) => `/gadanie-po-ladoni/${s}`),
  ];
}

export function getPalmArticlePaths() {
  const src = readFileSync(join(ROOT, "src/lib/seo/articles-palm.ts"), "utf8");
  return [...src.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => `/statyi/${m[1]}`);
}

export function palmAbsoluteUrls(base) {
  const root = String(base || "").replace(/\/$/, "");
  return [...getPalmSeoPaths(), ...getPalmArticlePaths()].map((p) => `${root}${p}`);
}
