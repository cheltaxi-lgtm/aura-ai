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

const MAJOR_HEADERS =
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
  // pure technical tokens / snake_case ids
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

/**
 * Structure reading for Telegram HTML: bold section titles, short paragraphs, lists.
 */
export function formatReadingForTelegramHtml(raw: string): string {
  let text = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  text = text.replace(MD_IMAGE_RE, "");
  text = text.replace(MAJOR_HEADERS, "\n\n§§$1§§\n\n");
  text = text.replace(/\*\*([^*]{1,80})\*\*/g, "§§$1§§");
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "§§$1§§");
  text = text.replace(/^—\s+/gm, "• ");
  text = text.replace(/^[-*]\s+/gm, "• ");
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  // Break long glued paragraphs into ~sentences for air.
  text = text
    .split(/\n{2,}/)
    .map((block) => {
      const t = block.trim();
      if (!t || t.startsWith("§§") || t.startsWith("• ")) return t;
      if (t.length < 220) return t;
      return t.replace(/([.!?…])\s+(?=[А-ЯЁA-Z«"])/g, "$1\n\n");
    })
    .join("\n\n");

  const parts = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const htmlParts: string[] = [];
  for (const part of parts) {
    if (/^§§.+§§$/.test(part)) {
      const title = part.slice(2, -2).replace(/^✦\s*/, "").trim();
      htmlParts.push(`✦ <b>${escapeHtml(title)}</b>`);
      continue;
    }
    if (part.includes("\n")) {
      const lines = part.split("\n").map((l) => l.trim()).filter(Boolean);
      htmlParts.push(lines.map((l) => escapeHtml(l)).join("\n"));
      continue;
    }
    htmlParts.push(escapeHtml(part));
  }

  return htmlParts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
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

/** Short elegant caption — cards already labelled on the collage. */
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

  const html = formatReadingForTelegramHtml(input.reading);
  if (!html) {
    if (markup) await ctx.reply("Разбор сохранён в истории.", { reply_markup: markup });
    return;
  }

  const chunks = chunkTelegramText(html, 3500);
  for (let i = 0; i < chunks.length; i++) {
    const last = i === chunks.length - 1;
    try {
      await ctx.reply(chunks[i]!, {
        parse_mode: "HTML",
        reply_markup: last ? markup : undefined,
      });
    } catch (err) {
      console.error("[present-reading] html send failed, plain fallback", err);
      await ctx.reply(stripReadingForTelegram(chunks[i]!), {
        reply_markup: last ? markup : undefined,
      });
    }
  }
}
