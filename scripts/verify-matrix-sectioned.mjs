/**
 * Verify engine-only zone assembly always passes the completeness gate.
 * Usage: npx tsx scripts/verify-matrix-sectioned.mjs
 */
import { destinyMatrix } from "../src/lib/numerology/destiny-matrix.ts";
import {
  isCompleteMatrixReading,
  matrixMissingSections,
} from "../src/lib/numerology/matrix-completeness.ts";
import {
  isUsableMatrixReading,
  sanitizeReadingForClient,
} from "../src/lib/chat-reply-sanitize.ts";
import {
  forceFillMissingSections,
  generateFullMatrixSectionedReading,
  renderEngineZoneProse,
} from "../src/lib/numerology/matrix-sectioned-reading.ts";
import { listMatrixZones } from "../src/lib/numerology/matrix-zones.ts";
import { appendNumerologFinale } from "../src/lib/numerology/numerolog-finale-client.ts";
import { buildMatrixPlainFinale } from "../src/lib/numerology/matrix-point-prompt.ts";

const birth = "1979-09-18";
const name = "Геннадий";
const matrix = destinyMatrix(birth);
if (!matrix) {
  console.error("FAIL: destinyMatrix returned null");
  process.exit(1);
}

const zones = listMatrixZones(matrix);
const required = zones.filter((z) => z.required);
console.log("zones", zones.length, "required", required.length);

const pure = [
  `${name}, полная матрица — разбор по зонам.`,
  ...zones.map((z) => renderEngineZoneProse(z, name, "male", matrix)),
].join("\n\n");
const withFinale = appendNumerologFinale(pure, buildMatrixPlainFinale(name, matrix));

console.log("engine-only len", withFinale.length);
console.log("missing", matrixMissingSections(withFinale));
console.log("complete", isCompleteMatrixReading(withFinale));

if (!isCompleteMatrixReading(withFinale)) {
  const filled = forceFillMissingSections("", matrix, name, "male");
  const filledFull = appendNumerologFinale(
    filled,
    buildMatrixPlainFinale(name, matrix)
  );
  console.log("force-fill complete", isCompleteMatrixReading(filledFull), "len", filledFull.length);
  if (!isCompleteMatrixReading(filledFull)) {
    console.error("FAIL: force-fill incomplete", matrixMissingSections(filledFull));
    process.exit(1);
  }
}

const sectioned = await generateFullMatrixSectionedReading({
  birthDate: birth,
  name,
  gender: "male",
  useLlm: false,
});
console.log("sectioned meta", sectioned.meta);
console.log("sectioned complete", isCompleteMatrixReading(sectioned.reading));
console.log("sectioned len", sectioned.reading.length);
if (!isCompleteMatrixReading(sectioned.reading)) {
  console.error("FAIL: sectioned incomplete", matrixMissingSections(sectioned.reading));
  process.exit(1);
}

const sanitized = sanitizeReadingForClient(sectioned.reading);
if (
  !sanitized ||
  !isCompleteMatrixReading(sanitized) ||
  !isUsableMatrixReading(sectioned.reading) ||
  !isUsableMatrixReading(sanitized)
) {
  console.error("FAIL: sanitize/usable gate", {
    sanLen: sanitized.length,
    completeSan: isCompleteMatrixReading(sanitized),
    usableRaw: isUsableMatrixReading(sectioned.reading),
    usableSan: isUsableMatrixReading(sanitized),
    missingSan: matrixMissingSections(sanitized || ""),
  });
  process.exit(1);
}

console.log("OK verify-matrix-sectioned");
