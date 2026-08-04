/**
 * One-off generator: pins current-engine outputs as regression fixtures for
 * scripts/fixtures/human-design-golden.json. Run: npx tsx scripts/_gen-hd-golden.mjs
 */
import { writeFileSync } from "node:fs";
import { calculateHdChart } from "../src/lib/human-design/calculate.ts";

const CASES = [
  { label: "moscow-1955-jpl-anchor", birthDate: "1955-02-10", birthTime: "03:00", timezone: "Europe/Moscow" },
  { label: "moscow-1990-afternoon", birthDate: "1990-06-15", birthTime: "14:59", timezone: "Europe/Moscow" },
  { label: "newyork-1971-halloween-2359", birthDate: "1971-10-31", birthTime: "23:59", timezone: "America/New_York" },
  { label: "vladivostok-2000-midnight", birthDate: "2000-01-01", birthTime: "00:00", timezone: "Asia/Vladivostok" },
  { label: "kiev-1986-soviet-decree", birthDate: "1986-04-26", birthTime: "01:23", timezone: "Europe/Kiev" },
  { label: "montreal-1948-night", birthDate: "1948-04-09", birthTime: "00:15", timezone: "America/Montreal" },
  { label: "sydney-2010-solstice-noon", birthDate: "2010-12-21", birthTime: "12:00", timezone: "Australia/Sydney" },
  { label: "utc-1999-eve", birthDate: "1999-12-31", birthTime: "14:05", timezone: "UTC" },
  { label: "almaty-1975-morning", birthDate: "1975-07-01", birthTime: "06:30", timezone: "Asia/Almaty" },
  { label: "berlin-2024-leapday", birthDate: "2024-02-29", birthTime: "08:45", timezone: "Europe/Berlin" },
];

const BODIES = ["sun", "earth", "moon", "mercury", "venus", "mars", "northNode"];

const out = CASES.map((c) => {
  const chart = calculateHdChart(c);
  const pick = (acts) =>
    Object.fromEntries(
      BODIES.map((b) => {
        const a = acts.find((x) => x.body === b);
        return [b, `${a.gate}.${a.line}`];
      })
    );
  return {
    label: c.label,
    birthDate: c.birthDate,
    birthTime: c.birthTime,
    timezone: c.timezone,
    expected: {
      type: chart.type,
      profile: chart.profile,
      authority: chart.authority,
      definition: chart.definition,
      activeGates: chart.activeGates.length,
      definedChannels: chart.channels.filter((ch) => ch.defined).length,
      personality: pick(chart.personality),
      design: pick(chart.designActivations),
    },
  };
});

writeFileSync(
  new URL("./fixtures/human-design-golden.json", import.meta.url),
  JSON.stringify(out, null, 2) + "\n",
  "utf8"
);
console.log(`wrote ${out.length} fixtures`);
