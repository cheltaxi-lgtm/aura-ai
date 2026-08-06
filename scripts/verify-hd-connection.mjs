/**
 * Smoke checks for deterministic HD connection analysis.
 */
import { calculateHdChart } from "../src/lib/human-design/calculate.ts";
import { analyzeHdConnection } from "../src/lib/human-design/connection.ts";

const a = calculateHdChart({
  birthDate: "1979-09-18",
  birthTime: null,
  timezone: "Asia/Yekaterinburg",
});
const b = calculateHdChart({
  birthDate: "1984-10-18",
  birthTime: "22:01",
  timezone: "Asia/Yekaterinburg",
});

const conn = analyzeHdConnection(a, b, { a: "Геннадий", b: "Юля" });
const checks = [];
const ok = (name, cond, detail = "") => {
  checks.push({ name, ok: Boolean(cond), detail });
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? `: ${detail}` : ""}`);
};

ok("headline", conn.headline.length > 8, conn.headline);
ok("merged gates", conn.mergedChart.activeGates.length >= Math.max(a.activeGates.length, b.activeGates.length));
ok("centers 9", conn.centers.length === 9);
ok("decision", /авторитет/i.test(conn.decisionNote));
ok("electro set matches", conn.electromagneticKeys.size === conn.electromagnetic.length);
ok("partner-only gates", conn.partnerOnlyGates.size === conn.bOnlyGates.length);
ok(
  "no channel double-class",
  (() => {
    const keys = [
      ...conn.electromagnetic,
      ...conn.companionship,
      ...conn.dominanceA,
      ...conn.dominanceB,
      ...conn.compromise,
    ].map((c) => c.key);
    return new Set(keys).size === keys.length;
  })()
);

const failed = checks.filter((c) => !c.ok);
console.log(
  `\n${checks.length - failed.length}/${checks.length} ok · electro=${conn.stats.electroCount} companionship=${conn.stats.companionshipCount}`
);
process.exit(failed.length ? 1 : 0);
