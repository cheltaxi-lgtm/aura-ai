import { collectBodyCopySamples } from "./ru.js";
import { EMOJI_RE, hasDisallowedEmoji } from "./emoji-whitelist.js";
import { NAV } from "../keyboards/index.js";

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

  const btnBad = Object.values(NAV).filter((label) => hasDisallowedEmoji(label));
  if (btnBad.length) {
    console.error("Disallowed emoji on NAV buttons:", btnBad);
    process.exit(1);
  }

  console.log(
    `ok: ${samples.length} body samples without emoji; ${Object.keys(NAV).length} NAV labels whitelisted`
  );
}

main();
