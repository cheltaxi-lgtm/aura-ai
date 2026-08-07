/**
 * Regenerate Human Design golden regression fixtures from the current engine.
 * Usage: npx tsx scripts/gen-hd-golden-fixtures.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const { calculateHdChart } = await import("../src/lib/human-design/calculate.ts");

const FIXTURE_PATH = resolve(
  process.cwd(),
  "scripts/fixtures/human-design-golden.json"
);

if (!existsSync(FIXTURE_PATH)) {
  console.error("fixtures missing:", FIXTURE_PATH);
  process.exit(1);
}

const fixtures = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
let changed = 0;

const next = fixtures.map((f) => {
  const chart = calculateHdChart({
    birthDate: f.birthDate,
    birthTime: f.birthTime ?? null,
    timezone: f.timezone,
  });
  const exp = {
    ...f.expected,
    type: chart.type,
    profile: chart.profile,
    authority: chart.authority,
    definition: chart.definition,
    crossAngle: chart.cross.angle,
    crossGates: chart.cross.gates,
    activeGates: chart.activeGates.length,
    definedChannels: chart.channels.filter((c) => c.defined).length,
    personality: Object.fromEntries(
      chart.personality.map((a) => [a.body, `${a.gate}.${a.line}`])
    ),
    design: Object.fromEntries(
      chart.designActivations.map((a) => [a.body, `${a.gate}.${a.line}`])
    ),
    ...(chart.stability ? { stability: chart.stability } : {}),
  };
  if (JSON.stringify(exp) !== JSON.stringify(f.expected)) changed++;
  return { ...f, expected: exp };
});

writeFileSync(FIXTURE_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
console.log(`golden fixtures rewritten: ${next.length} rows, ${changed} changed`);
