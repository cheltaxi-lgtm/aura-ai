/**
 * Live sectional HD report for Svetlana chart (cost + validator).
 * Usage: npx tsx scripts/hd-live-svetlana-report.mjs
 */
import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve } from "path";

for (const name of [".env.local", ".env"]) {
  const p = resolve(process.cwd(), name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m || process.env[m[1]]) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

const { calculateHdChart } = await import("../src/lib/human-design/calculate.ts");
const { generateHdReportSectional } = await import(
  "../src/lib/hd-report-pipeline/generate.ts"
);
const { validateHdReportText } = await import(
  "../src/lib/hd-report-quality/validator.ts"
);
const { expectedHdSectionalLlmCalls } = await import(
  "../src/lib/hd-report-pipeline/sections.ts"
);

const chart = calculateHdChart({
  birthDate: "1987-04-03",
  birthTime: "14:00",
  timezone: "Asia/Yekaterinburg",
});

console.log("engine", {
  type: chart.type,
  profile: chart.profile,
  authority: chart.authority,
  cross: chart.cross,
  expectedCalls: expectedHdSectionalLlmCalls(),
});

const result = await generateHdReportSectional({
  chart,
  clientName: "Светлана",
  aboutOther: false,
  focusQuestion: "Будут ли у меня отношения?",
  maxSectionRetries: 2,
});

const outPath = resolve(
  process.cwd(),
  "scripts/fixtures/hd-live-svetlana-sectional.md"
);
writeFileSync(outPath, result.text || "", "utf8");

const quality = validateHdReportText(result.text || "", {
  engineTypeRu: result.contract.typeRu,
  motorCount: result.contract.motorCentersDefinedRu.length,
  contract: result.contract,
  requireFocusAnswer: true,
});

const summary = {
  llmCalls: result.llmCalls,
  expectedCalls: expectedHdSectionalLlmCalls(),
  costRub: result.costRub,
  usage: result.usage,
  modelId: result.modelId,
  durationMs: result.durationMs,
  needsRegeneration: result.needsRegeneration,
  qualityOk: quality.ok,
  findings: quality.findings,
  typeRu: result.contract.typeRu,
  strategyRu: result.contract.strategyRu,
  crossAngleRu: result.contract.crossAngleRu,
  crossNameRu: result.contract.crossNameRu,
  hangingGatesRu: result.contract.hangingGatesRu,
  outPath,
  textLen: (result.text || "").length,
};

writeFileSync(
  resolve(process.cwd(), "scripts/fixtures/hd-live-svetlana-summary.json"),
  JSON.stringify(summary, null, 2),
  "utf8"
);
console.log(JSON.stringify(summary, null, 2));
process.exit(quality.ok ? 0 : 2);
