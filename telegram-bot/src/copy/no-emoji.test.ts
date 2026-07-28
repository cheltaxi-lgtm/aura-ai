import { collectBodyCopySamples } from "./ru.js";

/** Rough emoji / pictograph detector for body copy. */
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

function main(): void {
  const samples = collectBodyCopySamples();
  const bad: string[] = [];
  for (const s of samples) {
    if (EMOJI_RE.test(s)) bad.push(s.slice(0, 80));
  }
  if (bad.length) {
    console.error("Emoji found in body copy:", bad);
    process.exit(1);
  }
  console.log(`ok: ${samples.length} body copy samples without emoji`);
}

main();
