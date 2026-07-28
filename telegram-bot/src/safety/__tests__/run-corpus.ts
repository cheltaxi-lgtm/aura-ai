import { validateQuestion } from "../../domain/question/validate.js";
import {
  CRISIS_NEGATIVE,
  CRISIS_POSITIVE,
  MEDICAL_NEGATIVE,
  MEDICAL_POSITIVE,
  MINOR_NEGATIVE,
  MINOR_POSITIVE,
} from "./crisis-corpus.js";

function assertCorpus(
  label: string,
  phrases: string[],
  expectCode: "crisis" | "medical" | "minor" | null
): string[] {
  const fails: string[] = [];
  for (const phrase of phrases) {
    const r = validateQuestion(phrase);
    if (expectCode === null) {
      if (!r.ok) fails.push(`${label} NEGATIVE blocked (${r.code}): ${phrase}`);
    } else if (r.ok || r.code !== expectCode) {
      fails.push(`${label} POSITIVE missed (${r.ok ? "ok" : r.code}): ${phrase}`);
    }
  }
  return fails;
}

export function runSafetyCorpus(): { ok: boolean; fails: string[]; counts: Record<string, number> } {
  const fails = [
    ...assertCorpus("crisis", CRISIS_POSITIVE, "crisis"),
    ...assertCorpus("crisis", CRISIS_NEGATIVE, null),
    ...assertCorpus("medical", MEDICAL_POSITIVE, "medical"),
    ...assertCorpus("medical", MEDICAL_NEGATIVE, null),
    ...assertCorpus("minor", MINOR_POSITIVE, "minor"),
    ...assertCorpus("minor", MINOR_NEGATIVE, null),
  ];
  return {
    ok: fails.length === 0,
    fails,
    counts: {
      crisis_pos: CRISIS_POSITIVE.length,
      crisis_neg: CRISIS_NEGATIVE.length,
      medical_pos: MEDICAL_POSITIVE.length,
      medical_neg: MEDICAL_NEGATIVE.length,
      minor_pos: MINOR_POSITIVE.length,
      minor_neg: MINOR_NEGATIVE.length,
    },
  };
}

const isDirect =
  process.argv[1] &&
  (process.argv[1].includes("run-corpus") || process.argv[1].endsWith("run-corpus.ts"));

if (isDirect) {
  const r = runSafetyCorpus();
  console.log(r.counts);
  if (!r.ok) {
    console.error(r.fails.join("\n"));
    process.exit(1);
  }
  console.log("safety corpus OK");
}
