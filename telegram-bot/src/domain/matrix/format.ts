/** Premium matrix copy for Telegram (emoji allowed here — product surface). */

export type MatrixTeaserInput = {
  name?: string | null;
  birthDate?: string | null;
  portrait?: string | null;
  moneyInsight?: string | null;
  loveInsight?: string | null;
  yearInsight?: string | null;
  comfortInsight?: string | null;
  karmicInsight?: string | null;
  ageInsight?: string | null;
  periodTeaser?: string | null;
  /** Prefabricated dense card from site (preferred). */
  denseTeaser?: string | null;
  keyArcana?: Array<{ role: string; number: number; title: string; shortMeaning: string }>;
  cost?: number;
  runeBalance?: number | null;
};

/**
 * Canonical matrix-v2 sections — longest names first in matching.
 * One section → one Telegram pager message with its emoji.
 * Avoid short aliases (энергия, хвост, шаги) — they split titles mid-word.
 */
const MATRIX_POINTS: Array<{ name: string; emoji: string; aliases?: string[] }> = [
  { name: "Характер", emoji: "🜁", aliases: ["Тело и характер"] },
  {
    name: "Небо / энергия",
    emoji: "⚡",
    aliases: ["Небо/энергия", "Небо и энергия"],
  },
  {
    name: "Материя / год",
    emoji: "🌳",
    aliases: ["Материя/год", "Материя / год рождения", "Род и корни"],
  },
  { name: "Зона комфорта", emoji: "✨", aliases: ["Предназначение"] },
  { name: "Личное предназначение", emoji: "✦" },
  { name: "Социальное предназначение", emoji: "✦" },
  { name: "Духовное предназначение", emoji: "✦" },
  { name: "Духовный полюс", emoji: "🌌" },
  { name: "Таланты", emoji: "💎" },
  { name: "Деньги", emoji: "💰", aliases: ["Денежный канал"] },
  { name: "Отношения", emoji: "💞", aliases: ["Канал отношений"] },
  { name: "Род отца", emoji: "🕯", aliases: ["Род по отцу"] },
  { name: "Род матери", emoji: "🌙", aliases: ["Род по матери"] },
  {
    name: "Кармический хвост · корень",
    emoji: "♻️",
    aliases: ["Хвост · корень"],
  },
  {
    name: "Кармический хвост · середина",
    emoji: "♻️",
    aliases: ["Хвост · середина"],
  },
  {
    name: "Кармический хвост · остриё",
    emoji: "♻️",
    aliases: ["Кармический хвост · острие", "Хвост · остриё", "Хвост · острие"],
  },
  { name: "Кармический хвост", emoji: "♻️" },
  {
    name: "Возраст и текущий период",
    emoji: "🪴",
    aliases: ["Точка возраста сейчас", "Точка возраста", "Возраст сейчас", "Период возраста"],
  },
  {
    name: "Ближайший возрастной переход",
    emoji: "🪴",
    aliases: ["Возрастной переход", "Ближайший переход возраста"],
  },
  { name: "Аркан года", emoji: "📅", aliases: ["Аркан текущего года"] },
  { name: "Аркан месяца", emoji: "🌙" },
  { name: "Узел периода", emoji: "📅", aliases: ["Узел месяца", "Фокус периода"] },
  {
    name: "Небо",
    emoji: "🌌",
    aliases: ["Слой Небо", "Слой «Небо»", "Небо (натал)"],
  },
  {
    name: "Шаги на 30 дней",
    emoji: "🪴",
    aliases: ["Что делать", "Практика на 30 дней"],
  },
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelsLongestFirst(labels: string[]): string[] {
  return [...labels].sort((a, b) => b.length - a.length);
}

/** Whole-line titles — includes short-but-exact section heads. */
const LINE_LABELS = labelsLongestFirst(
  MATRIX_POINTS.flatMap((p) => [p.name, ...(p.aliases || [])])
);

const FREE_TITLE_RE =
  /^(Шаги\s+на\s+30\s+дней|Что\s+делать|Практика\s+на\s+30\s+дней|Кармический\s+хвост\s*[·.]\s*(?:корень|середина|остри[её])|Хвост\s*[·.]\s*(?:корень|середина|остри[её]))$/i;

/** Unique multi-word heads that are safe without «(15 — Дьявол)». */
const FREE_LINE_LABELS = labelsLongestFirst(LINE_LABELS.filter((n) => FREE_TITLE_RE.test(n.trim())));
/** All other heads require an arcana tail — stops mid-prose false pages. */
const ARCANA_LINE_LABELS = labelsLongestFirst(
  LINE_LABELS.filter((n) => !FREE_TITLE_RE.test(n.trim()))
);

const FREE_NAME_ALT = FREE_LINE_LABELS.map(escapeRe).join("|") || "Шаги\\s+на\\s+30\\s+дней";
const ARCANA_NAME_ALT = ARCANA_LINE_LABELS.map(escapeRe).join("|");

/** Required «(15 — Дьявол)» / «(6 — Влюблённые, 45 лет)» after most titles. */
const ARCANA_TAIL = String.raw`\s*\(\s*\d{1,2}\s*[—–\-]\s*[^)\n]+\)`;

/** Whole-line title token. Free titles may also carry «(8 — Сила)». */
const TITLE_CORE = String.raw`(?:#{1,3}\s*)?(?:[✨⚡🜁🌳💎💞💰🕯🌙♻️📅🪴✦🌌]\s*)?(?:(?:${ARCANA_NAME_ALT})(?:${ARCANA_TAIL})|(?:${FREE_NAME_ALT})(?:${ARCANA_TAIL})?)`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emojiForTitle(title: string): string {
  const base = title
    .replace(/^#{1,3}\s*/u, "")
    .replace(/^[✨⚡🜁🌳💎💞💰🕯🌙♻️📅🪴✦🌌]\s*/u, "")
    .replace(new RegExp(`${ARCANA_TAIL}\\s*$`, "u"), "")
    .replace(/:\s*$/u, "")
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ");
  let best: { emoji: string; len: number } | null = null;
  for (const p of MATRIX_POINTS) {
    for (const n of [p.name, ...(p.aliases || [])].map((x) =>
      x.toLowerCase().replace(/\s*\/\s*/g, " / ").replace(/\s+/g, " ")
    )) {
      if (base === n || base.startsWith(`${n} `) || base.startsWith(`${n}(`) || base.startsWith(`${n}·`)) {
        if (!best || n.length > best.len) best = { emoji: p.emoji, len: n.length };
      }
    }
  }
  if (best) return best.emoji;
  if (/шаг|практик|что делать|итог|вывод/i.test(base)) return "🪴";
  if (/матрица/i.test(base)) return "🌌";
  return "✦";
}

/**
 * Free teaser under the diagram — dense card, one fact per line.
 * Prefer `denseTeaser` from site summary when present.
 */
export function formatMatrixPremiumTeaser(input: MatrixTeaserInput): string {
  const cost = input.cost ?? 20;
  const bal =
    typeof input.runeBalance === "number" ? ` · баланс ${input.runeBalance}ᚢ` : "";

  const dense = (input.denseTeaser || "").trim();
  if (dense) {
    return [
      dense,
      "———",
      `Полный разбор Эвелины · ${cost}ᚢ${bal}`,
      "Кнопка ниже — открыть полный текст по зонам.",
    ].join("\n");
  }

  // Fallback if older API omits denseTeaser.
  const name = (input.name || "").trim();
  const birth = (input.birthDate || "").trim().slice(0, 10);
  const who = [name || null, birth || null].filter(Boolean).join(" · ");
  const strip = (raw: string | null | undefined) =>
    (raw || "")
      .replace(/\s+/g, " ")
      .replace(
        /^(Денежный канал|Отношения|Аркан года|Зона комфорта|Кармический хвост|Точка возраста|Возраст и текущий период|урок)\s*:\s*/i,
        ""
      )
      .trim();

  const lines = [
    who ? `🌌 Полная матрица Zovus · ${who}` : "🌌 Полная матрица Zovus",
    strip(input.portrait) ? `🜁 ${strip(input.portrait)}` : "",
    strip(input.comfortInsight) ? `✨ ${strip(input.comfortInsight)}` : "",
    strip(input.karmicInsight) ? `♻️ ${strip(input.karmicInsight)}` : "",
    strip(input.ageInsight) ? `🪴 ${strip(input.ageInsight)}` : "",
    strip(input.moneyInsight) ? `💰 ${strip(input.moneyInsight)}` : "",
    strip(input.loveInsight) ? `💞 ${strip(input.loveInsight)}` : "",
    strip(input.yearInsight) ? `📅 ${strip(input.yearInsight)}` : "",
    strip(input.periodTeaser) ? `🎯 ${strip(input.periodTeaser).slice(0, 160)}` : "",
    "———",
    `Полный разбор Эвелины · ${cost}ᚢ${bal}`,
    "Кнопка ниже — открыть полный текст по зонам.",
  ];

  return lines.filter(Boolean).join("\n");
}

/**
 * Normalize matrix prose so zone titles sit on their own line.
 * Deliberately conservative: no mid-sentence glue (it was cutting pages).
 */
export function normalizeMatrixReadingStructure(raw: string): string {
  let text = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return text;

  if (text.includes("\\n") && (text.match(/\n/g) || []).length < 8) {
    text = text.replace(/\\n/g, "\n");
  }

  // Strip markdown emphasis that breaks title matching.
  text = text.replace(/\*\*/g, "").replace(/^>\s?/gm, "");

  // Only split title+body when the title already starts the line
  // (never invent breaks inside «…» or mid-intro sentences).
  text = text.replace(
    new RegExp(`^(${TITLE_CORE})\\s+(?=[А-ЯЁA-Z«"0-9])`, "gim"),
    "$1\n"
  );
  text = text.replace(
    new RegExp(`^(${TITLE_CORE})\\s*:\\s*(?=\\S)`, "gim"),
    "$1\n"
  );

  // Markdown heading leftovers
  text = text.replace(/^#{1,3}\s+/gm, "");

  // Inline practice marker (same section — not a page break).
  text = text.replace(/(^|\n)([ \t]*)Практика\s*:/gim, "$1$2🪴 Практика:");

  // Subheads inside a single karmic-tail block → full section titles.
  // Only at line start — never inside running prose.
  text = text.replace(
    /(^|\n)\s*(?:·\s*)?(Корень|Середина|Остри[её])\s*[:.\-—–]\s*/giu,
    (_m, lead: string, label: string) => {
      const which = /корень/i.test(label)
        ? "Кармический хвост · корень"
        : /середина/i.test(label)
          ? "Кармический хвост · середина"
          : "Кармический хвост · остриё";
      return `${lead}${which}\n`;
    }
  );

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Decorate titles with role emoji (legacy helper — prefer buildMatrixTelegramPages).
 */
export function formatMatrixReadingPremium(raw: string): string {
  let text = normalizeMatrixReadingStructure(raw);
  if (!text) return text;

  text = text.replace(
    new RegExp(`^(?:[✨⚡🜁🌳💎💞💰🕯🌙♻️📅🪴✦🌌]\\s*)?(${TITLE_CORE})\\s*$`, "gim"),
    (_m, title: string) => {
      const plain = String(title)
        .replace(/^#{1,3}\s*/u, "")
        .replace(/^[✨⚡🜁🌳💎💞💰🕯🌙♻️📅🪴✦🌌]\s*/u, "")
        .trim();
      return `${emojiForTitle(plain)} ${plain}`;
    }
  );

  if (!/^🌌/m.test(text)) {
    text = `🌌 Матрица судьбы\n\n${text}`;
  }
  return text;
}

type MatrixSection = { title: string; body: string };

function splitMatrixSections(text: string): MatrixSection[] {
  const titleRe = new RegExp(`^(${TITLE_CORE})\\s*$`, "gim");

  const hits: Array<{ index: number; end: number; title: string }> = [];
  for (const m of text.matchAll(titleRe)) {
    const rawTitle = (m[1] || m[0])
      .replace(/^#{1,3}\s*/u, "")
      .replace(/^[✨⚡🜁🌳💎💞💰🕯🌙♻️📅🪴✦🌌]\s*/u, "")
      .trim();
    hits.push({
      index: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
      title: rawTitle,
    });
  }

  const sections: MatrixSection[] = [];
  if (!hits.length) {
    // Last resort: scan with site-style global section regex (not line-anchored).
    const loose = new RegExp(`(${TITLE_CORE})`, "giu");
    const looseHits: Array<{ index: number; end: number; title: string }> = [];
    for (const m of text.matchAll(loose)) {
      const rawTitle = (m[1] || m[0])
        .replace(/^#{1,3}\s*/u, "")
        .replace(/^[✨⚡🜁🌳💎💞💰🕯🌙♻️📅🪴✦🌌]\s*/u, "")
        .trim();
      // Skip false positives inside body shorter than a real heading context
      if (rawTitle.length < 3) continue;
      looseHits.push({
        index: m.index ?? 0,
        end: (m.index ?? 0) + m[0].length,
        title: rawTitle,
      });
    }
    if (looseHits.length >= 3) {
      return splitFromHits(text, looseHits);
    }
    return [{ title: "Матрица судьбы", body: text }];
  }

  return splitFromHits(text, hits);
}

function splitFromHits(
  text: string,
  hits: Array<{ index: number; end: number; title: string }>
): MatrixSection[] {
  const sections: MatrixSection[] = [];
  const intro = text.slice(0, hits[0]!.index).trim();
  if (intro) {
    sections.push({
      title: "Матрица судьбы",
      body: intro.replace(/^🌌\s*Матрица судьбы\s*/i, "").trim() || intro,
    });
  }

  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]!;
    const next = hits[i + 1];
    const body = text.slice(hit.end, next?.index ?? text.length).trim();
    sections.push({ title: hit.title, body });
  }

  // Expand single «Кармический хвост» into up to 3 pages when body has three blocks.
  // Drop empty parent header when ·корень/·середина/·остриё already follow as sections.
  const expanded: MatrixSection[] = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]!;
    const bareTail = /^кармический\s+хвост$/i.test(
      s.title.replace(new RegExp(ARCANA_TAIL, "u"), "").trim()
    );
    if (bareTail) {
      const parts = splitKarmicTailBody(s.body);
      if (parts.length >= 2) {
        expanded.push(...parts);
        continue;
      }
      const nextTitle = sections[i + 1]?.title || "";
      if (/кармический\s+хвост\s*[·.]/i.test(nextTitle) && !s.body.trim()) {
        continue;
      }
    }
    expanded.push(s);
  }

  const last = expanded[expanded.length - 1];
  if (last && !/шаги|что делать|итог|вывод/i.test(last.title)) {
    const stepSplit = last.body.split(
      /\n(?=(?:🪴\s*)?(?:Шаги|Что делать|Итог|Вывод)\b|\d+\)\s+)/u
    );
    if (stepSplit.length >= 2) {
      const head = stepSplit[0]!.trim();
      const tail = stepSplit.slice(1).join("\n").trim();
      if (head && tail.length > 40) {
        last.body = head;
        expanded.push({ title: "Шаги на 30 дней", body: tail });
      }
    }
  }

  return coalesceTinyMatrixSections(expanded.filter((s) => s.title || s.body));
}

/** True when a section looks like a false mid-prose title split, not a real zone. */
function isTruncatedMatrixSection(s: MatrixSection): boolean {
  // Real zone heads with arcana keep their own page even if the body is short
  // (bad AI fill) — merging hid whole zones from the album.
  if (/\(\s*\d{1,2}\s*[—–\-]/.test(s.title)) return false;
  const body = s.body.trim();
  if (!body) return true;
  if (body.length < 36) return true;
  // «Геннадий, твой» / unfinished clause — no sentence end yet.
  if (body.length < 90 && !/[.!?…]$/u.test(body) && !/Практика\s*:/i.test(body)) {
    return true;
  }
  return false;
}

/** Fold near-empty pages (false title splits) into neighbours. */
function coalesceTinyMatrixSections(sections: MatrixSection[]): MatrixSection[] {
  const out: MatrixSection[] = [];
  for (const raw of sections) {
    const s = { title: raw.title, body: raw.body.trim() };
    if (!s.title && !s.body) continue;

    if (out.length && isTruncatedMatrixSection(s)) {
      const prev = out[out.length - 1]!;
      prev.body = `${prev.body}\n\n${s.title}\n${s.body}`.trim();
      continue;
    }

    if (out.length && isTruncatedMatrixSection(out[out.length - 1]!)) {
      const prev = out.pop()!;
      const preferPrevTitle =
        /\(\s*\d{1,2}\s*[—–\-]/.test(prev.title) || prev.title.length >= s.title.length;
      out.push({
        title: preferPrevTitle ? prev.title : s.title,
        body: `${prev.body}\n\n${s.body}`.trim(),
      });
      continue;
    }

    out.push(s);
  }
  return out;
}

function splitKarmicTailBody(body: string): MatrixSection[] {
  const re =
    /(?:^|\n)\s*(?:🪴\s*)?(?:Корень|Середина|Остри[её]|1\)|2\)|3\))\s*[:.\-—–]?\s*/giu;
  const marks = [...body.matchAll(re)];
  if (marks.length < 2) return [];
  const labels = ["Кармический хвост · корень", "Кармический хвост · середина", "Кармический хвост · остриё"];
  const out: MatrixSection[] = [];
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i]!;
    const start = (m.index ?? 0) + m[0].length;
    const end = marks[i + 1]?.index ?? body.length;
    const chunk = body.slice(start, end).trim();
    if (!chunk) continue;
    out.push({ title: labels[Math.min(i, 2)]!, body: chunk });
  }
  return out;
}

function repairBrokenSectionBody(body: string): string {
  const t = (body || "").trim();
  if (!t) return t;
  if (
    t.includes("-):*") ||
    /^:\s*\*/m.test(t) ||
    /^[\-):*.•]+/u.test(t) ||
    (t.length < 120 && !/[.!?…)]$/u.test(t) && !/Практика\s*:/i.test(t))
  ) {
    return "Текст этой зоны оборвался при генерации. Нажмите «✨ Новая матрица» — разбор пересоберётся полностью.";
  }
  return t;
}

function sectionToMatrixHtml(section: MatrixSection): string {
  const emoji = emojiForTitle(section.title);
  const titlePlain = section.title
    .replace(/^#{1,3}\s*/u, "")
    .replace(/^[✨⚡🜁🌳💎💞💰🕯🌙♻️📅🪴✦🌌]\s*/u, "")
    .trim();
  const head = `<b>${emoji} ${escapeHtml(titlePlain)}</b>`;
  const body = repairBrokenSectionBody(section.body)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) =>
      p
        .split("\n")
        .map((l) => escapeHtml(l.trim()))
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
  return body ? `${head}\n\n${body}` : head;
}

/**
 * One Telegram message = one matrix section (emoji + bold title + body).
 */
export function buildMatrixTelegramPages(raw: string): string[] {
  const normalized = normalizeMatrixReadingStructure(raw);
  if (!normalized) return [];
  const sections = splitMatrixSections(normalized);
  const pages: string[] = [];
  for (const section of sections) {
    const html = sectionToMatrixHtml(section).trim();
    if (!html) continue;
    if (html.length <= 3200) {
      pages.push(html);
      continue;
    }
    const emoji = emojiForTitle(section.title);
    const titlePlain = section.title
      .replace(/^[✨⚡🜁🌳💎💞💰🕯🌙♻️📅🪴✦🌌]\s*/u, "")
      .trim();
    const head = `<b>${emoji} ${escapeHtml(titlePlain)}</b>`;
    const body = section.body.trim();
    let offset = 0;
    let part = 1;
    while (offset < body.length) {
      const chunk = body.slice(offset, offset + 2800);
      const cut =
        chunk.length < 2800
          ? chunk.length
          : Math.max(chunk.lastIndexOf("\n"), chunk.lastIndexOf(". "), 2000);
      const piece = body.slice(offset, offset + cut).trim();
      offset += cut;
      const suffix = part > 1 ? ` · ${part}` : "";
      pages.push(
        `${head}${suffix ? escapeHtml(suffix) : ""}\n\n${escapeHtml(piece)}`.replace(
          /\n{3,}/g,
          "\n\n"
        )
      );
      part += 1;
    }
  }
  return pages;
}
