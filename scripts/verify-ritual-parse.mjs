/**
 * Smoke tests for ritual JSON extraction + schema rules (mirrors ritual-prompt.ts).
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

const SILENCE_FORBID_RE = /молч|не говор|не рассказ|не обсужд|хранить\s+в\s+секрет/i;

function ritualPayloadIssues(parsed) {
  const issues = [];
  const place = typeof parsed.ritual_place === "string" ? parsed.ritual_place.trim() : "";
  if (!place) issues.push("ritual_place пустой");
  const steps = Array.isArray(parsed.ritual_steps)
    ? parsed.ritual_steps.filter(
        (s) => s && typeof s.step === "string" && typeof s.description === "string"
      )
    : [];
  if (steps.length !== 3) issues.push("нужно ровно 3 ritual_steps");
  const items = Array.isArray(parsed.ritual_items) ? parsed.ritual_items : [];
  if (items.length < 1 || items.length > 4) issues.push("1–4 ritual_items");
  if (!String(parsed.ritual_words || "").trim()) issues.push("ritual_words пустой");
  if (!String(parsed.ritual_word_of_power || "").trim()) {
    issues.push("ritual_word_of_power пустой");
  }
  const forbids = Array.isArray(parsed.ritual_forbids)
    ? parsed.ritual_forbids.map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  if (forbids.length < 2) issues.push("нужно минимум 2 ritual_forbids");
  if (!forbids.some((f) => SILENCE_FORBID_RE.test(f))) {
    issues.push("один forbid должен быть про молчание");
  }
  const signs = Array.isArray(parsed.ritual_signs)
    ? parsed.ritual_signs.map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  if (signs.length < 3) issues.push("нужно минимум 3 ritual_signs");
  return issues;
}

const sample = {
  ritual_place: "У окна",
  ritual_items: [{ item: "свеча", reason: "свет" }],
  ritual_steps: [
    { step: "1", description: "действие" },
    { step: "2", description: "тело" },
    { step: "3", description: "кульминация" },
  ],
  ritual_words: "Анна, открой путь",
  ritual_word_of_power: "SKJÖLDR",
  ritual_forbids: ["Не рассказывай никому", "Не возвращайся к старым мыслям"],
  ritual_signs: ["сон", "встреча", "совпадение"],
};

const weak = {
  ritual_place: "У окна",
  ritual_steps: [{ step: "1", description: "действие" }],
};

const cases = [
  ["plain", JSON.stringify(sample), true],
  ["fence", "```json\n" + JSON.stringify(sample) + "\n```", true],
  ["prose", "Ответ:\n" + JSON.stringify(sample) + "\nКонец", true],
  ["weak-schema", JSON.stringify(weak), false],
];

let failed = 0;
for (const [name, raw, expectOk] of cases) {
  const json = extractJsonObject(raw);
  if (!json) {
    console.error("FAIL:", name, "extract");
    failed++;
    continue;
  }
  const parsed = JSON.parse(json);
  const ok = ritualPayloadIssues(parsed).length === 0;
  if (ok !== expectOk) {
    console.error("FAIL:", name, "schema expected", expectOk, "got", ok, ritualPayloadIssues(parsed));
    failed++;
  } else {
    console.log("OK:", name);
  }
}

if (failed) process.exit(1);
console.log("\nAll ritual parse checks passed.");
