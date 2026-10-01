import { matrixZoneDefsFor } from "./matrix-zones";

const definitions = [...matrixZoneDefsFor(), ...matrixZoneDefsFor("child_matrix")];
const stepsTitle = definitions.find(zone => zone.id === "steps")!.titleCore;
const headingPrefix = String.raw`\s*(?:#{1,3}\s*)?(?:[^\p{L}\p{N}#\n]+\s*)?`;
const nextSection = new RegExp(
  String.raw`\n${headingPrefix}(?:#{1,3}\s+[^\n]+|${[...new Set(definitions.filter(zone => zone.id !== "steps").map(zone => zone.titleCore))].join("|")}|Простыми\s+словами)(?!\p{L})`, "iu"
);

/** A closing quote alone does not make a cut sentence complete. */
export function matrixProseHasCompleteEnding(text: string): boolean {
  return /[.!?](?:[»”"')\]]+)?$/u.test(text.trim().replace(/\*+/g, ""));
}

/** Check every numbered action; a complete report finale cannot hide a cut step. */
export function matrixStepsAreComplete(text: string, minSteps = 3): boolean {
  const body = text.replace(/\r\n/g, "\n").replace(/\*+/g, "")
    .replace(/^\s*#{0,3}\s*(?:Шаги\s+на\s+30\s+дней|Что\s+делать)\s*:?\s*/iu, "").trim();
  const starts = [...body.matchAll(/(?:^|\n)\s*(\d+)[.)]\s*/gu)];
  if (starts.length < minSteps || starts.length > 6 || starts[0]?.index !== 0) return false;
  return starts.every((match, index) => {
    if (Number(match[1]) !== index + 1) return false;
    const action = body.slice(match.index! + match[0].length, starts[index + 1]?.index ?? body.length).trim();
    return action.length >= 24 && matrixProseHasCompleteEnding(action);
  });
}

/** Extract this section before checking it independently from the report finale. */
export function matrixReadingStepsAreComplete(text: string): boolean {
  const raw = text.replace(/\r\n/g, "\n");
  const heading = raw.match(new RegExp(String.raw`(?:^|\n)${headingPrefix}${stepsTitle}(?!\p{L})[^\n]*\n`, "iu"));
  if (!heading) return false;
  const remainder = raw.slice(heading.index! + heading[0].length);
  const boundary = remainder.search(nextSection);
  return matrixStepsAreComplete(boundary < 0 ? remainder : remainder.slice(0, boundary));
}
