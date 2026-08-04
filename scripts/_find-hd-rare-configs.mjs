/**
 * One-off search: finds birth moments exercising rare HD configurations
 * (reflector/lunar, triple/quadruple split, ego authorities) so they can be
 * pinned as golden fixtures. Run: npx tsx scripts/_find-hd-rare-configs.mjs
 */
import { calculateHdChart } from "../src/lib/human-design/calculate.ts";

const WANT = {
  reflector: (c) => c.type === "reflector",
  tripleSplit: (c) => c.definition === "tripleSplit",
  quadrupleSplit: (c) => c.definition === "quadrupleSplit",
  egoManifested: (c) => c.authority === "egoManifested",
  egoProjected: (c) => c.authority === "egoProjected",
};

const found = {};
const zones = ["Europe/Moscow", "America/New_York", "Asia/Tokyo", "Europe/London"];
const t0 = Date.now();
let scanned = 0;

outer: for (let day = 0; day < 365 * 90; day += 1) {
  const date = new Date(Date.UTC(1950, 0, 1) + day * 86_400_000);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  for (const hh of [1, 7, 13, 19]) {
    const timezone = zones[(day + hh) % zones.length];
    const chart = calculateHdChart({
      birthDate: `${yyyy}-${mm}-${dd}`,
      birthTime: `${String(hh).padStart(2, "0")}:00`,
      timezone,
    });
    scanned++;
    for (const [key, test] of Object.entries(WANT)) {
      if (!found[key] && test(chart)) {
        found[key] = {
          label: `rare-${key}`,
          birthDate: `${yyyy}-${mm}-${dd}`,
          birthTime: `${String(hh).padStart(2, "0")}:00`,
          timezone,
          type: chart.type,
          authority: chart.authority,
          definition: chart.definition,
          profile: chart.profile,
        };
        console.log(`FOUND ${key}:`, JSON.stringify(found[key]));
      }
    }
    if (Object.keys(found).length === Object.keys(WANT).length) break outer;
  }
}

console.log(`scanned ${scanned} charts in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log("missing:", Object.keys(WANT).filter((k) => !found[k]));
