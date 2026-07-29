import { InputFile } from "grammy";
import type { Context } from "grammy";
import { FULL_DECK, TRIPLET_POSITIONS } from "../deck/cards.js";
import type { DrawnCard, TarotCardDef } from "../deck/types.js";
import { chunkTelegramText } from "../site-client.js";
import { renderDayCardImage, renderTripletCollage } from "../../render/card-collage.js";

type ReplyMarkup = NonNullable<Parameters<Context["reply"]>[1]>["reply_markup"];

const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const DECK_PATH_RE = /\/decks\/[^/]+\/([^/.]+)\.(?:png|webp|jpg|jpeg)/i;
const REVERSED_RE = /\(перев[^)]*\)|\(rev(?:ersed)?\.?\)|перевёрнут[аы]?|перевернут[аы]?/i;

/** Technical / empty intentions that must never appear in captions. */
const JUNK_QUESTION_RE =
  /^(custom|null|undefined|default|test|n\/?a|none|unknown|intention|question|chip|guest|-|—|\.|…)$/i;

const SECTION_HEADERS =
  /(?:^|\n)\s*(?:#{1,3}\s*)?(?:✦\s*)?(Простыми словами|Шаги(?:\s+на\s+\d+\s+дней)?|Что делать|Итог|Вывод|Совет\s+карт(?:ы)?|Практика(?:\s+на\s+(?:неделю|месяц|30\s+дней))?|Общий вывод|Ключевые выводы|Краткое резюме|Прошлое|Настоящее|Будущее|Карта\s+\d+|Позиция\s+\d+)\s*:?\s*(?=\S)/giu;

function normalizeCardName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(REVERSED_RE, "")
    .replace(/[«»"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findDefByName(name: string): TarotCardDef | undefined {
  const n = normalizeCardName(name);
  if (!n) return undefined;
  return (
    FULL_DECK.find((c) => normalizeCardName(c.name) === n) ||
    FULL_DECK.find((c) => {
      const cn = normalizeCardName(c.name);
      return cn.includes(n) || n.includes(cn);
    })
  );
}

function findDefBySlug(slug: string): TarotCardDef | undefined {
  const s = slug.trim().toLowerCase();
  return FULL_DECK.find((c) => c.slug === s);
}

function parseReversed(raw: string, explicit?: boolean): boolean {
  if (typeof explicit === "boolean") return explicit;
  return REVERSED_RE.test(raw);
}

export function cleanQuestion(question?: string | null): string | null {
  const t = (question || "").replace(/\s+/g, " ").trim();
  if (!t || t.length < 2) return null;
  if (JUNK_QUESTION_RE.test(t)) return null;
  if (/^[a-z][a-z0-9_]{0,24}$/i.test(t) && !/[а-яё]/i.test(t)) return null;
  return t;
}

/** Strip site markdown card images / headers so Telegram shows clean prose. */
export function stripReadingForTelegram(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(MD_IMAGE_RE, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function proseToHtml(block: string): string {
  const t = block
    .replace(/\*\*/g, "")
    .replace(/^—\s+/gm, "• ")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!t) return "";

  // Air out long glued paragraphs.
  const aired =
    t.length > 220
      ? t.replace(/([.!?…])\s+(?=[А-ЯЁA-Z«"])/g, "$1\n\n")
      : t;

  return aired
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
}

type Section = { title: string | null; body: string };

function splitByHeaders(text: string): Section[] {
  const marked = text.replace(SECTION_HEADERS, "\n\n§§$1§§\n\n");
  const parts = marked
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const sections: Section[] = [];
  let current: Section = { title: null, body: "" };

  const flush = () => {
    const body = current.body.replace(/\n{3,}/g, "\n\n").trim();
    if (current.title || body) sections.push({ title: current.title, body });
    current = { title: null, body: "" };
  };

  for (const part of parts) {
    const m = /^§§(.+)§§$/.exec(part);
    if (m) {
      flush();
      current.title = m[1]!.replace(/^✦\s*/, "").trim();
      continue;
    }
    current.body = current.body ? `${current.body}\n\n${part}` : part;
  }
  flush();
  return sections.filter((s) => s.title || s.body.trim());
}

/** Prefer card-named blocks when the model writes continuous prose. */
function splitByCardMentions(text: string, cards: DrawnCard[]): Section[] | null {
  if (cards.length < 2) return null;
  const positions = cards
    .map((c, i) => {
      const re = new RegExp(c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const m = re.exec(text);
      return m ? { i, index: m.index, card: c } : null;
    })
    .filter((x): x is { i: number; index: number; card: DrawnCard } => Boolean(x))
    .sort((a, b) => a.index - b.index);

  if (positions.length < 2) return null;

  const sections: Section[] = [];
  const intro = text.slice(0, positions[0]!.index).trim();
  if (intro.length > 40) {
    sections.push({ title: "Общий взгляд", body: intro });
  }

  for (let p = 0; p < positions.length; p++) {
    const start = positions[p]!.index;
    const end = p + 1 < positions.length ? positions[p + 1]!.index : text.length;
    const body = text.slice(start, end).trim();
    const card = positions[p]!.card;
    const rev = card.reversed ? " · перевёрнута" : "";
    sections.push({
      title: `${card.positionLabel}: ${card.name}${rev}`,
      body,
    });
  }
  return sections;
}

function sectionToHtml(section: Section): string {
  const body = proseToHtml(section.body);
  if (section.title) {
    const head = `✦ <b>${escapeHtml(section.title)}</b>`;
    return body ? `${head}\n\n${body}` : head;
  }
  return body;
}

/**
 * Build short Telegram HTML messages (one section ≈ one bubble).
 * Bot-only — does not touch site rendering.
 */
export function buildTelegramReadingMessages(raw: string, cards: DrawnCard[] = []): string[] {
  let text = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  text = text.replace(MD_IMAGE_RE, "").replace(/^#{1,6}\s+/gm, "").trim();
  if (!text) return [];

  let sections = splitByHeaders(text);
  // Split the leading untitled prose by card mentions; keep closing sections (Простыми словами / Шаги).
  if (cards.length >= 2 && sections[0] && !sections[0].title) {
    const byCards = splitByCardMentions(sections[0].body, cards);
    if (byCards && byCards.length >= 2) {
      sections = [...byCards, ...sections.slice(1)];
    }
  } else if (sections.filter((s) => s.title).length < 2) {
    const byCards = splitByCardMentions(stripReadingForTelegram(text), cards);
    if (byCards && byCards.length >= 2) sections = byCards;
  }

  // Still one wall → split into short overview + rest paragraphs.
  if (sections.length === 1 && !sections[0]!.title) {
    const paras = sections[0]!.body
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (paras.length >= 3) {
      sections = [
        { title: "Общий взгляд", body: paras.slice(0, 2).join("\n\n") },
        ...paras.slice(2).map((p, i) => ({
          title: i === paras.length - 3 ? "Дальше по раскладу" : null,
          body: p,
        })),
      ];
      // Collapse untitled middles into fewer bubbles (max ~4 body bubbles).
      const head = sections[0]!;
      const rest = sections.slice(1);
      const merged: Section[] = [head];
      let buf = "";
      for (const s of rest) {
        const next = buf ? `${buf}\n\n${s.body}` : s.body;
        if (next.length > 700 && buf) {
          merged.push({ title: null, body: buf });
          buf = s.body;
        } else {
          buf = next;
        }
      }
      if (buf) merged.push({ title: null, body: buf });
      sections = merged;
    }
  }

  const messages = sections
    .map(sectionToHtml)
    .map((m) => m.trim())
    .filter(Boolean);

  // Hard safety: never send a single mega-bubble if we can chunk.
  const out: string[] = [];
  for (const msg of messages) {
    if (msg.length <= 1200) {
      out.push(msg);
      continue;
    }
    for (const chunk of chunkTelegramText(msg, 1100)) out.push(chunk);
  }
  return out;
}

/** @deprecated prefer buildTelegramReadingMessages — kept for strip/chat helpers */
export function formatReadingForTelegramHtml(raw: string): string {
  return buildTelegramReadingMessages(raw).join("\n\n————\n\n");
}

/** Pull card faces from markdown image rows in persisted readings. */
export function extractCardsFromReadingMarkdown(text: string): DrawnCard[] {
  const out: DrawnCard[] = [];
  for (const match of text.matchAll(MD_IMAGE_RE)) {
    const alt = (match[1] || "").trim();
    const url = (match[2] || "").trim();
    const slug = DECK_PATH_RE.exec(url)?.[1];
    const def = (slug && findDefBySlug(slug)) || findDefByName(alt);
    if (!def) continue;
    if (out.some((c) => c.slug === def.slug)) continue;
    const i = out.length;
    out.push({
      id: def.id,
      name: def.name,
      meaning: def.meaning,
      slug: def.slug,
      position: i,
      reversed: parseReversed(alt),
      positionLabel: TRIPLET_POSITIONS[i] ?? `Карта ${i + 1}`,
      deck_id: "tarot-veronika",
      spread_id: "triplet",
    });
    if (out.length >= 3) break;
  }
  return out;
}

export function drawnCardsFromSiteCards(
  cards: Array<{
    id?: number;
    name: string;
    reversed?: boolean;
    position?: number;
    positionLabel?: string;
    meaning?: string;
  }>
): DrawnCard[] {
  const out: DrawnCard[] = [];
  for (let i = 0; i < cards.length && out.length < 3; i++) {
    const c = cards[i]!;
    const def =
      (typeof c.id === "number" ? FULL_DECK.find((d) => d.id === c.id) : undefined) ||
      findDefByName(c.name);
    if (!def) continue;
    out.push({
      id: def.id,
      name: def.name,
      meaning: c.meaning || def.meaning,
      slug: def.slug,
      position: typeof c.position === "number" ? c.position : i,
      reversed: parseReversed(c.name, c.reversed),
      positionLabel: c.positionLabel || TRIPLET_POSITIONS[i] || `Карта ${i + 1}`,
      deck_id: "tarot-veronika",
      spread_id: "triplet",
    });
  }
  return out;
}

export function drawnCardsFromNameList(names: string[]): DrawnCard[] {
  return drawnCardsFromSiteCards(names.map((name) => ({ name })));
}

function captionFor(question?: string | null): string {
  const q = cleanQuestion(question);
  if (q) return `✦ ${q.length > 180 ? `${q.slice(0, 177)}…` : q}`;
  return "✦ Расклад Zovus";
}

async function renderCardsImage(cards: DrawnCard[], question?: string | null): Promise<Buffer> {
  const q = cleanQuestion(question);
  if (cards.length === 1) {
    return renderDayCardImage(cards[0]!);
  }
  return renderTripletCollage(cards.slice(0, 3), {
    revealedCount: Math.min(3, cards.length),
    question: q || undefined,
  });
}

/** Photo collage + structured HTML reading. Buttons only on the last text bubble. */
export async function presentReadingToTelegram(
  ctx: Context,
  input: {
    reading: string;
    cards?: DrawnCard[];
    cardNames?: string[];
    question?: string | null;
    replyMarkup?: ReplyMarkup;
  }
): Promise<void> {
  let cards = input.cards?.length ? input.cards : [];
  if (!cards.length && input.cardNames?.length) {
    cards = drawnCardsFromNameList(input.cardNames);
  }
  if (!cards.length) {
    cards = extractCardsFromReadingMarkdown(input.reading);
  }

  const question = cleanQuestion(input.question);
  const markup = input.replyMarkup;

  if (cards.length > 0) {
    try {
      const buf = await renderCardsImage(cards, question);
      await ctx.replyWithPhoto(new InputFile(buf, "spread.jpg"), {
        caption: captionFor(question),
      });
    } catch (err) {
      console.error("[present-reading] collage failed", err);
      await ctx.reply(captionFor(question));
    }
  }

  const messages = buildTelegramReadingMessages(input.reading, cards);
  if (!messages.length) {
    if (markup) await ctx.reply("Разбор сохранён в истории.", { reply_markup: markup });
    return;
  }

  for (let i = 0; i < messages.length; i++) {
    const last = i === messages.length - 1;
    try {
      await ctx.reply(messages[i]!, {
        parse_mode: "HTML",
        reply_markup: last ? markup : undefined,
      });
    } catch (err) {
      console.error("[present-reading] html send failed, plain fallback", err);
      await ctx.reply(stripReadingForTelegram(messages[i]!), {
        reply_markup: last ? markup : undefined,
      });
    }
  }
}
