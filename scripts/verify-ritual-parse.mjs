/**
 * Smoke tests for ritual JSON extraction logic.
 * Run: node scripts/verify-ritual-parse.mjs
 */

function stripMarkdownFence(raw) {
  return raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonObject(raw) {
  const cleaned = stripMarkdownFence(raw);
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    /* fall through */
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const slice = cleaned.slice(start, end + 1);
  try {
    JSON.parse(slice);
    return slice;
  } catch {
    return null;
  }
}

const sample = {
  ritual_place: "У окна",
  ritual_steps: [{ step: "1", description: "действие" }],
};

const cases = [
  ["plain", JSON.stringify(sample)],
  ["fence", "```json\n" + JSON.stringify(sample) + "\n```"],
  ["prose", "Ответ:\n" + JSON.stringify(sample) + "\nКонец"],
];

let failed = 0;
for (const [name, raw] of cases) {
  const json = extractJsonObject(raw);
  if (!json) {
    console.error("FAIL:", name);
    failed++;
    continue;
  }
  const parsed = JSON.parse(json);
  if (!parsed.ritual_steps?.length) {
    console.error("FAIL:", name, "missing steps");
    failed++;
  } else {
    console.log("OK:", name);
  }
}

if (failed) process.exit(1);
console.log("\nAll ritual parse checks passed.");
