/**
 * Re-scores saved audit texts with the current metric set — no LLM calls.
 *   node node_modules/.bin/tsx scripts/audit-rescore.ts /tmp/reading-audit.json
 */
import { readFileSync } from "node:fs";

import {
  fillerHits,
  hasFinalBlock,
  hasSimplyWordsSection,
  hedgeHits,
  mixesTuVy,
  openingLine,
  verdictUpFront,
} from "./_reading-metrics";

type Saved = { id: string; characterId: string; cardCount: number; text: string };

const path = process.argv[2] ?? "/tmp/reading-audit.json";
const rows = JSON.parse(readFileSync(path, "utf8")) as Saved[];

console.log(
  ["сценарий".padEnd(18), "вердикт".padStart(8), "финал".padStart(6), "##Простыми".padStart(11), "ты/вы".padStart(6), "hedge".padStart(6), "вода".padStart(20)].join(" ")
);
for (const r of rows) {
  console.log(
    [
      r.id.padEnd(18),
      (verdictUpFront(r.text) ? "да" : "НЕТ").padStart(8),
      (hasFinalBlock(r.text) ? "да" : "НЕТ").padStart(6),
      (hasSimplyWordsSection(r.text) ? "да" : "НЕТ").padStart(11),
      (mixesTuVy(r.text) ? "МИКС" : "ок").padStart(6),
      String(hedgeHits(r.text)).padStart(6),
      (fillerHits(r.text).join(",") || "-").padStart(20),
    ].join(" ")
  );
}

console.log("\n=== ФОРМАТИРОВАНИЕ ===");
console.log(["сценарий".padEnd(18), "пустых строк".padStart(13), "жирных имён".padStart(12), "карт".padStart(5)].join(" "));
for (const r of rows) {
  console.log(
    [
      r.id.padEnd(18),
      String((r.text.match(/\n\s*\n/g) ?? []).length).padStart(13),
      String((r.text.match(/\*\*[^*]+\*\*/g) ?? []).length).padStart(12),
      String(r.cardCount).padStart(5),
    ].join(" ")
  );
}

console.log("\n=== ПЕРВАЯ СТРОКА КАЖДОГО РАСКЛАДА ===");
for (const r of rows) console.log(`${r.id.padEnd(18)} | ${openingLine(r.text)}`);
