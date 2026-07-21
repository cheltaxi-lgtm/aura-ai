/**
 * Turn wall-of-text destiny-matrix readings into structured markdown
 * so ChatMessageRenderer can show premium headings + numbered steps.
 */

const MATRIX_READING_HINT_RE =
  /матриц[аы]\s+судьбы|точка\s+тела\s+и\s+характера|ось\s+предназначения|простыми\s+словами/i;

/** Section titles the model uses for Full Matrix reports. */
const MATRIX_SECTION_RE =
  /(?:Точка\s+(?:тела\s+и\s+характера|энергии|рода\s+и\s+корней|талантов|денег|отношений|кармы)|Ось\s+предназначения|Род\s+по\s+(?:отцу|матери)|Аркан\s+года)(?:\s*\([^)]{1,48}\))?|Шаги\s+на\s+30\s+дней|Простыми\s+словами/giu;

const MAJOR_SECTION_RE = /^(Шаги\s+на\s+30\s+дней|Простыми\s+словами)$/i;

const FINALE_LINE_RE =
  /(?=(?:Предназначение|Деньги|Аркан\s+этого\s+года)\s+[—–-])/gu;

export function looksLikeDestinyMatrixReading(text: string): boolean {
  const t = text.trim();
  if (t.length < 120) return false;
  return MATRIX_READING_HINT_RE.test(t);
}

/** Put each `1)` / `2.` step on its own line; normalize to `1. ` markdown. */
export function breakNumberedSteps(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    // Glued steps: "...действие. 2) Следующий" or "...действие 2) Следующий"
    .replace(/(?<!^)(?<!\n)\s*(?=\d{1,2}[).]\s+\S)/gm, "\n")
    .replace(/^(\d{1,2})\)\s+/gm, "$1. ");
}

function formatFinaleBlock(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";

  let parts = trimmed.includes("\n")
    ? trimmed
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  // "Имя, опора характера — … Предназначение — … Деньги — … Аркан этого года — …"
  if (parts.length < 2) {
    parts = trimmed
      .split(FINALE_LINE_RE)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  if (parts.length < 2) {
    parts = trimmed
      .split(/(?<=[.!?…])\s+(?=[А-ЯЁA-Z])/u)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  return parts
    .map((line) => {
      const m = line.match(/^(.+?[—–-]\s*[^:]{2,60}?)\s*:\s*(.+)$/u);
      if (m) {
        return `- **${m[1].trim()}:** ${m[2].trim()}`;
      }
      return `- ${line}`;
    })
    .join("\n");
}

function headingForSection(title: string): string {
  const clean = title.replace(/:\s*$/, "").trim();
  if (MAJOR_SECTION_RE.test(clean)) {
    return `## ${clean}`;
  }
  return `### ${clean}`;
}

/**
 * Structure a destiny-matrix prose blob as markdown (headings + lists).
 * Idempotent enough for already-structured input.
 */
export function formatDestinyMatrixReadingForDisplay(raw: string): string {
  const input = raw.replace(/\r\n/g, "\n").trim();
  if (!input || !looksLikeDestinyMatrixReading(input)) return raw;

  // Already structured by a previous pass / prompt — still normalize steps.
  if (/^#{2,3}\s/m.test(input)) {
    return breakNumberedSteps(input).replace(/\n{3,}/g, "\n\n").trim();
  }

  const matches = [...input.matchAll(MATRIX_SECTION_RE)];
  if (!matches.length) {
    return breakNumberedSteps(input).replace(/\n{3,}/g, "\n\n").trim();
  }

  const chunks: string[] = [];
  const intro = input.slice(0, matches[0]!.index ?? 0).trim();
  if (intro) chunks.push(intro);

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const title = match[0].replace(/:\s*$/, "").trim();
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[i + 1]?.index ?? input.length;
    let body = input.slice(start, end).replace(/^[\s:.—–-]+/, "").trim();

    chunks.push(headingForSection(title));

    if (/^простыми\s+словами$/i.test(title)) {
      chunks.push(formatFinaleBlock(body));
      continue;
    }

    if (/^шаги\s+на\s+30\s+дней$/i.test(title)) {
      body = breakNumberedSteps(body);
      // Ensure blank line before list for react-markdown
      chunks.push(body);
      continue;
    }

    // Soft paragraph breaks inside a point; highlight practice cue
    body = body
      .replace(/\s+(?=Практика\s*:)/gu, "\n\n")
      .replace(/(^|\n)(Практика\s*:)/gu, "$1**$2**")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    chunks.push(body);
  }

  return chunks
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
