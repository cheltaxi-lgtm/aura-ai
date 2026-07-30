import { InlineKeyboard, InputFile } from "grammy";
import type { Context } from "grammy";
import { setFlow, getFlow } from "../../db/repos.js";
import { FULL_DECK, TRIPLET_POSITIONS } from "../deck/cards.js";
import type { DrawnCard, TarotCardDef } from "../deck/types.js";
import { buildSessionChatUrl, chunkTelegramText } from "../site-client.js";
import {
  MAX_COLLAGE_CARDS,
  renderDayCardImage,
  renderSpreadCollage,
} from "../../render/card-collage.js";
import { CB, readingPagerKeyboard } from "../../keyboards/index.js";
import { widenTelegramText } from "../telegram-width.js";

type ReplyMarkup = NonNullable<Parameters<Context["reply"]>[1]>["reply_markup"];

const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const DECK_PATH_RE = /\/decks\/[^/]+\/([^/.]+)\.(?:png|webp|jpg|jpeg)/i;
const REVERSED_RE = /\(перев[^)]*\)|\(rev(?:ersed)?\.?\)|перевёрнут[аы]?|перевернут[аы]?/i;

/** Technical / empty intentions that must never appear in captions. */
const JUNK_QUESTION_RE =
  /^(custom|null|undefined|default|test|n\/?a|none|unknown|intention|question|chip|guest|-|—|\.|…)$/i;

const SECTION_HEADERS =
  /(?:^|\n)\s*(?:#{1,3}\s*)?(?:✦\s*)?(Простыми словами|Шаги(?:\s+на\s+\d+\s+дней)?|Что делать|Итог|Вывод|Совет\s+карт(?:ы)?|Практика(?:\s+на\s+(?:неделю|месяц|30\s+дней))?|Общий вывод|Ключевые выводы|Краткое резюме|Прошлое|Настоящее|Будущее|Карта\s+\d+|Позиция\s+\d+)\s*:?\s*(?=\S)/giu;

type ReadingViewState = {
  pages: string[];
  page: number;
  chatUrl?: string;
  footer?: string;
  matrixActions?: boolean;
  matrixSiteUrl?: string;
};

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
 * Build short Telegram HTML pages for the reading album.
 * Bot-only — does not touch site rendering.
 */
export function buildTelegramReadingMessages(raw: string, cards: DrawnCard[] = []): string[] {
  let text = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  text = text.replace(MD_IMAGE_RE, "").replace(/^#{1,6}\s+/gm, "").trim();
  if (!text) return [];

  let sections = splitByHeaders(text);
  if (cards.length >= 2 && sections[0] && !sections[0].title) {
    const byCards = splitByCardMentions(sections[0].body, cards);
    if (byCards && byCards.length >= 2) {
      sections = [...byCards, ...sections.slice(1)];
    }
  } else if (sections.filter((s) => s.title).length < 2) {
    const byCards = splitByCardMentions(stripReadingForTelegram(text), cards);
    if (byCards && byCards.length >= 2) sections = byCards;
  }

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

  // Merge tiny slides so the album feels premium, not twitchy.
  const coalesced: Section[] = [];
  for (const s of sections) {
    const prev = coalesced[coalesced.length - 1];
    if (
      prev &&
      !s.title &&
      prev.body.length + s.body.length < 850 &&
      coalesced.length > 1
    ) {
      prev.body = `${prev.body}\n\n${s.body}`;
      continue;
    }
    coalesced.push({ ...s });
  }

  const messages = coalesced
    .map(sectionToHtml)
    .map((m) => m.trim())
    .filter(Boolean);

  // Telegram HTML album pages — keep readable length; width via widenTelegramText.
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
    if (out.length >= MAX_COLLAGE_CARDS) break;
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
  for (let i = 0; i < cards.length && out.length < MAX_COLLAGE_CARDS; i++) {
    const c = cards[i]!;
    const rawName = (c.name || "").trim();
    if (!rawName) continue;
    const def =
      (typeof c.id === "number" ? FULL_DECK.find((d) => d.id === c.id) : undefined) ||
      findDefByName(rawName);
    const reversed = parseReversed(rawName, c.reversed);
    // Keep every slot even if art is missing — collage shows back + label.
    out.push({
      id: def?.id ?? 9000 + i,
      name: def?.name ?? (rawName.replace(REVERSED_RE, "").trim() || rawName),
      meaning: c.meaning || def?.meaning || "",
      slug: def?.slug ?? "_back",
      position: typeof c.position === "number" ? c.position : i,
      reversed,
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
  const base = q
    ? `✦ ${q.length > 180 ? `${q.slice(0, 177)}…` : q}`
    : "✦ Расклад Zovus";
  return widenTelegramText(base).slice(0, 1024);
}

async function renderCardsImage(cards: DrawnCard[], question?: string | null): Promise<Buffer> {
  const q = cleanQuestion(question);
  if (cards.length === 1) {
    return renderDayCardImage(cards[0]!);
  }
  return renderSpreadCollage(cards.slice(0, MAX_COLLAGE_CARDS), {
    revealedCount: Math.min(MAX_COLLAGE_CARDS, cards.length),
    question: q || undefined,
  });
}

function isInlineKeyboard(markup: ReplyMarkup | undefined): markup is InlineKeyboard {
  return Boolean(markup && typeof markup === "object" && "inline_keyboard" in markup);
}

function pageBody(
  pages: string[],
  page: number,
  footer?: string
): string {
  const total = pages.length;
  const idx = Math.min(Math.max(0, page), Math.max(0, total - 1));
  const body = pages[idx] || "";
  const parts = [body];
  if (footer && idx === total - 1) {
    parts.push(footer);
  }
  return parts.join("\n\n").trim();
}

function pageHtml(
  pages: string[],
  page: number,
  footer?: string
): string {
  const total = pages.length;
  const idx = Math.min(Math.max(0, page), Math.max(0, total - 1));
  const parts = [pageBody(pages, page, footer)];
  if (total > 1) {
    parts.push(`<i>· ${idx + 1} / ${total} ·</i>`);
  }
  return widenTelegramText(parts.filter(Boolean).join("\n\n")).slice(0, 3900);
}

function pagerMarkup(state: ReadingViewState): InlineKeyboard {
  return readingPagerKeyboard({
    page: state.page,
    total: state.pages.length,
    chatUrl: state.chatUrl,
    matrixActions: state.matrixActions,
    matrixSiteUrl: state.matrixSiteUrl,
  });
}

/**
 * Photo collage (cards) + HTML reading album with ‹ › pagination.
 * Body is text (widened), not rasterized pages — easier to read in chat.
 */
export async function presentReadingToTelegram(
  ctx: Context,
  input: {
    reading: string;
    cards?: DrawnCard[];
    cardNames?: string[];
    question?: string | null;
    /** @deprecated prefer sessionId — kept for day card reply keyboard path */
    replyMarkup?: ReplyMarkup;
    sessionId?: string;
    footer?: string;
    /** Put matrix calc/delete/site buttons on the same album keyboard. */
    matrixActions?: boolean;
    matrixSiteUrl?: string | null;
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
  const tid = ctx.from?.id;

  const pages = buildTelegramReadingMessages(input.reading, cards);
  const chatUrl = input.sessionId ? buildSessionChatUrl(input.sessionId) : undefined;
  const matrixSiteUrl = input.matrixSiteUrl?.trim() || undefined;
  const state: ReadingViewState = {
    pages,
    page: 0,
    chatUrl,
    footer: input.footer?.trim() || undefined,
    matrixActions: Boolean(input.matrixActions),
    matrixSiteUrl,
  };

  const usePager =
    pages.length > 1 || Boolean(chatUrl) || Boolean(input.matrixActions);
  const markup =
    input.replyMarkup && isInlineKeyboard(input.replyMarkup)
      ? input.replyMarkup
      : usePager
        ? pagerMarkup(state)
        : input.replyMarkup;

  // Card collage stays as photo; reading body is HTML text (easier to read) with width pad + pager.
  if (cards.length > 0) {
    try {
      const collageBuf = await renderCardsImage(cards, question);
      await ctx.replyWithPhoto(new InputFile(collageBuf, "spread.jpg"));
    } catch (err) {
      console.error("[present-reading] collage failed", err);
      if (question) await ctx.reply(captionFor(question));
    }
  } else if (question) {
    await ctx.reply(captionFor(question));
  }

  if (!pages.length) {
    if (input.replyMarkup) {
      await ctx.reply("Разбор сохранён в истории.", { reply_markup: input.replyMarkup });
    }
    return;
  }

  if (usePager && tid) {
    setFlow(tid, "reading_view", "page", state as unknown as Record<string, unknown>);
  }

  const html = pageHtml(state.pages, 0, state.footer);
  try {
    await ctx.reply(html, {
      parse_mode: "HTML",
      reply_markup: markup,
    });
  } catch (err) {
    console.error("[present-reading] html send failed, plain fallback", err);
    await ctx.reply(widenTelegramText(stripReadingForTelegram(pages.join("\n\n"))), {
      reply_markup: markup,
    });
  }
}

export async function handleReadingPagerCallback(
  ctx: Context,
  data: string
): Promise<boolean> {
  if (!data.startsWith(CB.rdPrefix)) return false;
  const tid = ctx.from?.id;
  if (!tid) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    return true;
  }

  if (data === CB.rdNoop) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    return true;
  }

  if (!data.startsWith(CB.rdPagePrefix)) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    return false;
  }

  const page = Number(data.slice(CB.rdPagePrefix.length));
  const flow = getFlow(tid);
  if (!flow || flow.flow !== "reading_view" || !Array.isArray(flow.data.pages)) {
    await ctx.answerCallbackQuery({ text: "Расклад уже закрыт — откройте снова" }).catch(() => undefined);
    return true;
  }

  const state: ReadingViewState = {
    pages: flow.data.pages as string[],
    page: Number.isFinite(page) ? page : 0,
    chatUrl: typeof flow.data.chatUrl === "string" ? flow.data.chatUrl : undefined,
    footer: typeof flow.data.footer === "string" ? flow.data.footer : undefined,
    matrixActions: Boolean(flow.data.matrixActions),
    matrixSiteUrl:
      typeof flow.data.matrixSiteUrl === "string" ? flow.data.matrixSiteUrl : undefined,
  };
  if (!state.pages.length) {
    await ctx.answerCallbackQuery({ text: "Пусто" }).catch(() => undefined);
    return true;
  }

  state.page = Math.min(Math.max(0, state.page), state.pages.length - 1);
  setFlow(tid, "reading_view", "page", state as unknown as Record<string, unknown>);

  const html = pageHtml(state.pages, state.page, state.footer);
  const markup = pagerMarkup(state);
  const hasPhoto = Boolean(
    ctx.callbackQuery?.message && "photo" in ctx.callbackQuery.message
  );

  try {
    if (hasPhoto) {
      // Migrate older photo-page albums to text on first flip.
      await ctx.deleteMessage().catch(() => undefined);
      await ctx.reply(html, { parse_mode: "HTML", reply_markup: markup });
    } else {
      await ctx.editMessageText(html, {
        parse_mode: "HTML",
        reply_markup: markup,
      });
    }
    await ctx.answerCallbackQuery({ text: `${state.page + 1} / ${state.pages.length}` }).catch(() => undefined);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/message is not modified/i.test(msg)) {
      await ctx.answerCallbackQuery().catch(() => undefined);
      return true;
    }
    console.error("[reading-pager] edit failed", err);
    await ctx.answerCallbackQuery({ text: "Не удалось перелистнуть" }).catch(() => undefined);
  }
  return true;
}
