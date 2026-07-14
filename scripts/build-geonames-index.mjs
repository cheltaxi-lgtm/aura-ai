#!/usr/bin/env node
/**
 * Build compact GeoNames search index from cities15000.txt
 * Run: npm run build:geonames
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "data", "geonames", "cities15000.txt");
const OUT = path.join(ROOT, "data", "geonames", "cities.min.json");

function normalize(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ё/g, "е");
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error("Missing", SRC);
    process.exit(1);
  }

  const raw = fs.readFileSync(SRC, "utf8");
  const cities = [];

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    if (cols.length < 18) continue;
    const name = cols[1];
    const ascii = cols[2];
    const alts = cols[3];
    const lat = parseFloat(cols[4]);
    const lon = parseFloat(cols[5]);
    const country = cols[8];
    const admin1 = cols[10];
    const pop = parseInt(cols[14], 10) || 0;
    const tz = cols[17];
    if (!name || Number.isNaN(lat) || Number.isNaN(lon) || !tz) continue;

    const label = admin1 ? `${name}, ${admin1}, ${country}` : `${name}, ${country}`;
    const altSample = alts ? alts.split(",").slice(0, 80) : [];
    const q = normalize([name, ascii, ...altSample].join(" "));
    cities.push({
      n: label,
      q,
      la: Math.round(lat * 10000) / 10000,
      lo: Math.round(lon * 10000) / 10000,
      tz,
      p: pop,
    });
  }

  cities.sort((a, b) => b.p - a.p);
  fs.writeFileSync(OUT, JSON.stringify(cities));
  console.log(`build:geonames OK — ${cities.length} cities → ${OUT}`);
}

main();
