/**
 * Shared plain-text → premium paragraph helpers.
 *
 * Most master/reading text arrives as plain prose (prompts forbid markdown).
 * Rendering it verbatim produces a single "wall of text"; these helpers break
 * it into readable, well-spaced paragraphs for a premium feel.
 */

/**
 * Break a single run-on block into readable 1–2 sentence paragraphs.
 * Short blocks are returned untouched.
 */
export function splitWallOfText(text: string): string[] {
  const clean = text.replace(/[ \t]+/g, " ").trim();
  if (!clean) return [];
  if (clean.length < 220) return [clean];

  const sentences =
    clean
      .match(/[^.!?…]+(?:[.!?…]+(?:["»)“”']+)?|$)/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? [clean];

  const groups: string[] = [];
  let buf: string[] = [];
  let bufLen = 0;

  for (const sentence of sentences) {
    buf.push(sentence);
    bufLen += sentence.length;
    if (buf.length >= 2 && bufLen >= 170) {
      groups.push(buf.join(" "));
      buf = [];
      bufLen = 0;
    }
  }
  if (buf.length) {
    // Avoid a lonely tail sentence — merge it into the previous paragraph.
    if (buf.length === 1 && groups.length) {
      groups[groups.length - 1] += ` ${buf[0]}`;
    } else {
      groups.push(buf.join(" "));
    }
  }
  return groups.length ? groups : [clean];
}

/**
 * Parse plain text into paragraph blocks. Respects author-provided blank-line
 * breaks, and softens any block that is itself a wall of text.
 */
export function toParagraphs(text: string): string[] {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length > 1) {
    return blocks.flatMap((block) => (block.includes("\n") ? [block] : splitWallOfText(block)));
  }

  return splitWallOfText(blocks[0] ?? text);
}
