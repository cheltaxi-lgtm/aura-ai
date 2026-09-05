import { InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import { randomBytes } from "node:crypto";
import { setFlow, getFlow } from "../../db/repos.js";
import { getDb, nowIso } from "../../db/client.js";
import { FULL_DECK, TRIPLET_POSITIONS } from "../deck/cards.js";
import type { DrawnCard, TarotCardDef } from "../deck/types.js";
import { buildSessionChatUrl, chunkTelegramText } from "../site-client.js";
import {
  MAX_COLLAGE_CARDS,
  renderDayCardImage,
  renderSpreadCollage,
} from "../../render/card-collage.js";
import { CB, readingPagerKeyboard } from "../../keyboards/index.js";
import { buildMatrixTelegramPages } from "../matrix/format.js";
import { widenTelegramText } from "../telegram-width.js";
import { replyPhotoBudget } from "../tg-send.js";

type ReplyMarkup = NonNullable<Parameters<Context["reply"]>[1]>["reply_markup"];

const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const DECK_PATH_RE = /\/decks\/[^/]+\/([^/.]+)\.(?:png|webp|jpg|jpeg)/i;
const REVERSED_RE = /\(перев[^)]*\)|\(rev(?:ersed)?\.?\)|перевёрнут[аы]?|перевернут[аы]?/i;

/** Technical / empty intentions that must never appear in captions. */
const JUNK_QUESTION_RE =
  /^(custom|null|undefined|default|test|n\/?a|none|unknown|intention|question|chip|guest|-|—|\.|…)$/i;

/** Matrix point titles (with optional role emoji + "(18 — Луна)") + tarot finales. */
const SECTION_HEADERS =
  /(?:^|\n)\s*(?:#{1,3}\s*)?(?:✦\s*)?((?:[✨⚡🜁🌳💎💞💰🕯🌙♻️📅🪴✦🌌]\s*)?(?:Предназначение|Зона\s+комфорта|Характер|Тело и характер|Небо(?:\s*\/\s*энергия)?|Энергия|Материя(?:\s*\/\s*год)?|Род и корни|Таланты|Денежный\s+канал|Деньги|Канал\s+отношений|Отношения|Род\s+(?:по\s+)?отц[ау]|Род\s+(?:по\s+)?матер[ии]|Кармический\s+хвост(?:\s*[·.]\s*(?:корень|середина|остри[её]))?|Карма|Точка\s+возраста(?:\s+сейчас)?|Ближайший\s+возрастной\s+переход|Аркан\s+(?:года|месяца)|Узел\s+периода|Небо|Духовный\s+полюс)(?:\s*\(\s*\d{1,2}\s*[—–\-]\s*[^)\n]+\))?|Простыми словами|Шаги(?:\s+на\s+\d+\s+дней)?|Что делать|Итог|Вывод|Совет\s+карт(?:ы)?|Практика(?:\s+на\s+(?:неделю|месяц|30\s+дней))?|Общий вывод|Ключевые выводы|Краткое резюме|Прошлое|Настоящее|Будущее|Карта\s+\d+|Позиция\s+\d+)\s*:?\s*(?=\S)/giu;

type ReadingViewState = {
  viewId?: string;
  pages: string[];
  page: number;
  chatUrl?: string;
  footer?: string;
  matrixActions?: boolean;
  matrixSiteUrl?: string;
  matrixReportId?: string;
  matrixSubjectId?: string;
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
    const title = section.title.trim();
    // Matrix titles already carry a role emoji — don't stack ✦ in front.
    const headed = /^(?:[✨⚡🜁🌳💎💞💰🕯🌙♻️📅🪴✦🌌]|[\u{1F300}-\u{1FAFF}])/u.test(title)
      ? `<b>${escapeHtml(title)}</b>`
      : `✦ <b>${escapeHtml(title)}</b>`;
    return body ? `${headed}\n\n${body}` : headed;
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

function persistReadingView(tid: number, state: ReadingViewState): void {
  if (!state.viewId) return;
  getDb().prepare(`INSERT INTO bot_reading_views (id, telegram_user_id, data, updated_at)
    VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
    .run(state.viewId, tid, JSON.stringify(state), nowIso());
  getDb().prepare(`DELETE FROM bot_reading_views WHERE telegram_user_id = ? AND updated_at < ?`)
    .run(tid, new Date(Date.now() - 30 * 86_400_000).toISOString());
}

export function activateReadingView(tid: number, viewId: string): boolean {
  const row = getDb().prepare(`SELECT data FROM bot_reading_views WHERE id = ? AND telegram_user_id = ?`)
    .get(viewId, tid) as { data: string } | undefined;
  if (!row) return false;
  const state = JSON.parse(row.data) as ReadingViewState;
  setFlow(tid, 'reading_view', 'page', state as unknown as Record<string, unknown>);
  return true;
}

/** Keep the quoted person/report attached to a teaser even after later navigation. */
export function createMatrixView(tid: number, subjectId?: string, reportId?: string): string {
  const viewId = randomBytes(6).toString('hex');
  persistReadingView(tid, { viewId, pages: [], page: 0, matrixActions: true,
    matrixSubjectId: subjectId, matrixReportId: reportId });
  return viewId;
}

function pagerMarkup(state: ReadingViewState): InlineKeyboard {
  // Fat matrix action rows only on first/last page — mid-album flips stay light on mobile.
  const showMatrixActions =
    Boolean(state.matrixActions) &&
    (state.page === 0 || state.page >= state.pages.length - 1);
  return readingPagerKeyboard({
    page: state.page,
    total: state.pages.length,
    viewId: state.viewId,
    chatUrl: state.chatUrl,
    matrixActions: showMatrixActions,
    matrixSiteUrl: state.matrixSiteUrl,
  });
}

function plainReadingText(text: string): string {
  return stripReadingForTelegram(text)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
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
    matrixReportId?: string | null;
    matrixSubjectId?: string | null;
    /** Matrix album: one message = one point with emoji (not tarot splitter). */
    matrixPaging?: boolean;
  }
): Promise<void> {
  const matrixPaging = Boolean(input.matrixPaging || input.matrixActions);
  let cards = input.cards?.length ? input.cards : [];
  if (!matrixPaging) {
    if (!cards.length && input.cardNames?.length) {
      cards = drawnCardsFromNameList(input.cardNames);
    }
    if (!cards.length) {
      cards = extractCardsFromReadingMarkdown(input.reading);
    }
  }

  const question = matrixPaging ? null : cleanQuestion(input.question);
  const tid = ctx.from?.id;

  const pages = matrixPaging
    ? buildMatrixTelegramPages(input.reading)
    : buildTelegramReadingMessages(input.reading, cards);
  const chatUrl = input.sessionId ? buildSessionChatUrl(input.sessionId) : undefined;
  const matrixSiteUrl = input.matrixSiteUrl?.trim() || undefined;
  const state: ReadingViewState = {
    viewId: randomBytes(6).toString("hex"),
    pages,
    page: 0,
    chatUrl,
    footer: input.footer?.trim() || undefined,
    matrixActions: Boolean(input.matrixActions),
    matrixSiteUrl,
    matrixReportId: input.matrixReportId?.trim() || undefined,
    matrixSubjectId: input.matrixSubjectId?.trim() || undefined,
  };

  const usePager =
    pages.length > 1 || Boolean(chatUrl) || Boolean(input.matrixActions);
  const markup =
    input.replyMarkup && isInlineKeyboard(input.replyMarkup)
      ? input.replyMarkup
      : usePager
        ? pagerMarkup(state)
        : input.replyMarkup;

  if (!pages.length && !cards.length) {
    if (question) await ctx.reply(captionFor(question));
    if (input.replyMarkup) {
      await ctx.reply("Разбор сохранён в истории.", { reply_markup: input.replyMarkup });
    }
    return;
  }

  if (usePager && tid && pages.length) {
    persistReadingView(tid, state);
    const prior = getFlow(tid);
    const views = prior?.flow === "reading_view" && prior.data.views && typeof prior.data.views === "object"
      ? (prior.data.views as Record<string, unknown>) : {};
    views[state.viewId!] = state;
    const keys = Object.keys(views);
    for (const key of keys.slice(0, Math.max(0, keys.length - 8))) delete views[key];
    setFlow(tid, "reading_view", "page", { ...state, views } as unknown as Record<string, unknown>);
  }

  // Text first — never block the reading on a hung sendPhoto (was up to 60s on this VPS).
  if (pages.length) {
    const html = pageHtml(state.pages, 0, state.footer);
    try {
      await ctx.reply(html, {
        parse_mode: "HTML",
        reply_markup: markup,
      });
    } catch (err) {
      console.error("[present-reading] html send failed, plain fallback", err);
      const chunks = chunkTelegramText(widenTelegramText(plainReadingText(pages.join("\n\n"))));
      for (let i = 0; i < chunks.length; i++) {
        await ctx.reply(chunks[i]!, { reply_markup: i === chunks.length - 1 ? markup : undefined });
      }
    }
  } else if (question) {
    await ctx.reply(captionFor(question), { reply_markup: markup });
  }

  if (cards.length > 0) {
    try {
      const collageBuf = await renderCardsImage(cards, question);
      const ok = await replyPhotoBudget(ctx, collageBuf, "spread.jpg");
      if (!ok && question && !pages.length) {
        await ctx.reply(captionFor(question));
      }
    } catch (err) {
      console.error("[present-reading] collage failed", err);
      if (question && !pages.length) await ctx.reply(captionFor(question));
    }
  }
}

/**
 * Jump active reading_view album to a page (edits the callback message when possible).
 * Returns false when there is no matrix/reading album in flow.
 */
export async function jumpReadingAlbumPage(
  ctx: Context,
  page: number,
  answerText?: string,
  requestedViewId?: string
): Promise<boolean> {
  const tid = ctx.from?.id;
  if (!tid) return false;
  if (requestedViewId && !activateReadingView(tid, requestedViewId)) {
    await ctx.answerCallbackQuery({ text: 'Откройте этот разбор из истории заново.' }).catch(() => undefined);
    return true;
  }
  const flow = getFlow(tid);
  if (!flow || flow.flow !== "reading_view" || !Array.isArray(flow.data.pages)) {
    return false;
  }
  const source = flow.data;
  if (!Array.isArray(source.pages) || !source.pages.length) return false;

  const state: ReadingViewState = {
    viewId: typeof source.viewId === "string" ? source.viewId : requestedViewId,
    pages: source.pages as string[],
    page: Number.isFinite(page) ? page : 0,
    chatUrl: typeof source.chatUrl === "string" ? source.chatUrl : undefined,
    footer: typeof source.footer === "string" ? source.footer : undefined,
    matrixActions: Boolean(source.matrixActions),
    matrixSiteUrl:
      typeof source.matrixSiteUrl === "string" ? source.matrixSiteUrl : undefined,
    matrixReportId:
      typeof source.matrixReportId === "string" ? source.matrixReportId : undefined,
    matrixSubjectId:
      typeof source.matrixSubjectId === "string" ? source.matrixSubjectId : undefined,
  };
  state.page = Math.min(Math.max(0, state.page), state.pages.length - 1);
  persistReadingView(tid, state);
  const views = flow.data.views && typeof flow.data.views === "object"
    ? flow.data.views as Record<string, unknown> : {};
  if (state.viewId) views[state.viewId] = state;
  setFlow(tid, "reading_view", "page", { ...state, views } as unknown as Record<string, unknown>);

  const html = pageHtml(state.pages, state.page, state.footer);
  const markup = pagerMarkup(state);
  const hasPhoto = Boolean(
    ctx.callbackQuery?.message && "photo" in ctx.callbackQuery.message
  );
  const toast =
    answerText?.trim() || `${state.page + 1} / ${state.pages.length}`;

  // Unlock the button immediately — waiting for editMessageText feels laggy on mobile.
  await ctx.answerCallbackQuery({ text: toast }).catch(() => undefined);

  try {
    if (hasPhoto) {
      await ctx.deleteMessage().catch(() => undefined);
      await ctx.reply(html, { parse_mode: "HTML", reply_markup: markup });
    } else if (ctx.callbackQuery?.message) {
      await ctx.editMessageText(html, {
        parse_mode: "HTML",
        reply_markup: markup,
      });
    } else {
      await ctx.reply(html, { parse_mode: "HTML", reply_markup: markup });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/message is not modified/i.test(msg)) {
      return true;
    }
    // Callback may be on another bubble (period/share) — send album page as new message.
    try {
      await ctx.reply(html, { parse_mode: "HTML", reply_markup: markup });
      return true;
    } catch (replyErr) {
      console.error("[reading-pager] jump failed", replyErr || err);
      return true;
    }
  }
  return true;
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

  const raw = data.slice(CB.rdPagePrefix.length);
  const separator = raw.lastIndexOf(":");
  const requestedViewId = separator > 0 ? raw.slice(0, separator) : undefined;
  if (!requestedViewId) {
    await ctx.answerCallbackQuery({ text: 'Старая кнопка: откройте разбор из истории.' }).catch(() => undefined);
    return true;
  }
  const page = Number(separator > 0 ? raw.slice(separator + 1) : raw);
  return jumpReadingAlbumPage(ctx, Number.isFinite(page) ? page : 0, undefined, requestedViewId);
}
