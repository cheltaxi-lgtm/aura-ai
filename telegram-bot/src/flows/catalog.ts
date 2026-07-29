import type { Context, InlineKeyboard, Keyboard } from "grammy";
import { botConfig } from "../config.js";
import { copy } from "../copy/ru.js";
import { clearFlow, getFlow, setFlow, trackEvent } from "../db/repos.js";
import {
  siteCatalog,
  type SiteCatalogItem,
} from "../domain/site-client.js";
import {
  CB,
  catalogHomeKeyboard,
  catalogItemKeyboard,
  catalogListKeyboard,
  salonKeyboard,
} from "../keyboards/index.js";
import { ensureOnboarded } from "./helpers.js";
import { beginCustomQuestion, runSpreadQuestion } from "./spread.js";
import { ensureSiteLinked } from "./site-account.js";

type ReplyMarkup = InlineKeyboard | Keyboard;

type CatalogMode = "featured" | "all" | "category";

type CatalogListState = {
  mode: CatalogMode;
  category?: string;
  page: number;
  items: Array<{
    id: string;
    title: string;
    native: boolean;
    url: string;
    cost: number;
    cardCount: number;
    questionTemplate: string;
  }>;
  totalPages: number;
  total: number;
};

type CatalogDetailState = CatalogListState & {
  slug: string;
  title: string;
  description: string;
  native: boolean;
  url: string;
  questionTemplate: string;
  cost: number;
  cardCount: number;
  categoryLabel: string;
  positionsPreview: string[];
};

const PAGE_SIZE = 8;

function siteCatalogUrl(): string {
  const base = botConfig.siteUrl.replace(/\/$/, "");
  return `${base}/rasklady?utm_source=telegram&utm_medium=bot&utm_campaign=spread_catalog`;
}

function compactItems(items: SiteCatalogItem[]) {
  return items.map((i) => ({
    id: i.id,
    title: i.title,
    native: i.native,
    url: i.url,
    cost: i.cost,
    cardCount: i.cardCount,
    questionTemplate: i.questionTemplate,
  }));
}

async function replyOrEdit(
  ctx: Context,
  text: string,
  reply_markup: ReplyMarkup
): Promise<void> {
  const canEditInline =
    Boolean(ctx.callbackQuery?.message) &&
    typeof (reply_markup as InlineKeyboard).inline_keyboard !== "undefined";
  if (canEditInline) {
    try {
      await ctx.editMessageText(text, {
        reply_markup: reply_markup as InlineKeyboard,
      });
      return;
    } catch {
      // Message not editable — fall through.
    }
  }
  await ctx.reply(text, { reply_markup });
}

export async function beginCatalog(ctx: Context): Promise<void> {
  const user = await ensureOnboarded(ctx);
  if (!user) return;

  let result: Awaited<ReturnType<typeof siteCatalog>>;
  try {
    result = await siteCatalog(user.telegram_user_id, { action: "summary" });
  } catch (err) {
    console.error("[catalog] summary failed", err);
    await ctx.reply(copy.catalogFailed, { reply_markup: salonKeyboard() });
    return;
  }

  const data = result.data;
  if (!data.ok || !data.categories) {
    await ctx.reply(copy.catalogFailed, { reply_markup: salonKeyboard() });
    return;
  }

  setFlow(user.telegram_user_id, "catalog", "home", {});
  trackEvent("catalog_opened", user.telegram_user_id, { total: data.total ?? 0 });

  const bal =
    typeof data.runeBalance === "number" ? `\nБаланс: ${data.runeBalance} рун.` : "";
  const featuredPreview = (data.featured || [])
    .slice(0, 4)
    .map((f) => `· ${f.title}`)
    .join("\n");

  const text = [
    copy.catalogTitle,
    "",
    copy.catalogPick,
    data.total != null ? `Всего раскладов: ${data.total}.` : "",
    bal.trim(),
    featuredPreview ? `\nПопулярные:\n${featuredPreview}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  await ctx.reply(text, {
    reply_markup: catalogHomeKeyboard(data.categories, siteCatalogUrl()),
  });
}

async function showList(
  ctx: Context,
  telegramUserId: number,
  mode: CatalogMode,
  page: number,
  category?: string
): Promise<void> {
  let result: Awaited<ReturnType<typeof siteCatalog>>;
  try {
    result = await siteCatalog(telegramUserId, {
      action: "list",
      category: mode === "category" ? category : null,
      featured: mode === "featured",
      page,
      page_size: PAGE_SIZE,
    });
  } catch (err) {
    console.error("[catalog] list failed", err);
    await replyOrEdit(ctx, copy.catalogFailed, salonKeyboard());
    return;
  }

  const data = result.data;
  if (!data.ok || !data.items) {
    await replyOrEdit(ctx, copy.catalogFailed, salonKeyboard());
    return;
  }

  if (!data.items.length) {
    await replyOrEdit(
      ctx,
      copy.catalogEmpty,
      catalogHomeKeyboard([], siteCatalogUrl())
    );
    return;
  }

  const state: CatalogListState = {
    mode,
    category,
    page: data.page ?? 0,
    items: compactItems(data.items),
    totalPages: data.totalPages ?? 1,
    total: data.total ?? data.items.length,
  };
  setFlow(telegramUserId, "catalog", "list", state as unknown as Record<string, unknown>);

  const heading =
    mode === "featured"
      ? `⭐ ${copy.catalogFeatured}`
      : mode === "category" && data.items[0]
        ? data.items[0].categoryLabel
        : copy.catalogAll;
  const text = [
    heading,
    `Стр. ${(data.page ?? 0) + 1}/${data.totalPages ?? 1} · всего ${data.total ?? 0}.`,
    "",
    "Выберите расклад:",
  ].join("\n");
  await replyOrEdit(
    ctx,
    text,
    catalogListKeyboard(state.items, state.page, state.totalPages)
  );
}

async function showItem(
  ctx: Context,
  telegramUserId: number,
  slug: string,
  listState: CatalogListState
): Promise<void> {
  let result: Awaited<ReturnType<typeof siteCatalog>>;
  try {
    result = await siteCatalog(telegramUserId, { action: "item", slug });
  } catch (err) {
    console.error("[catalog] item failed", err);
    await replyOrEdit(ctx, copy.catalogFailed, salonKeyboard());
    return;
  }

  const item = result.data.item;
  if (!result.data.ok || !item) {
    await replyOrEdit(ctx, copy.catalogFailed, salonKeyboard());
    return;
  }

  const detail: CatalogDetailState = {
    ...listState,
    slug: item.id,
    title: item.title,
    description: item.description,
    native: item.native,
    url: item.url,
    questionTemplate: item.questionTemplate,
    cost: item.cost,
    cardCount: item.cardCount,
    categoryLabel: item.categoryLabel,
    positionsPreview: item.positionsPreview || [],
  };
  setFlow(telegramUserId, "catalog", "detail", detail as unknown as Record<string, unknown>);
  trackEvent("catalog_item_opened", telegramUserId, {
    slug: item.id,
    native: item.native,
    spread_id: item.spreadId,
  });

  const positions = (item.positionsPreview || [])
    .slice(0, 5)
    .map((p) => `· ${p}`)
    .join("\n");
  const where = item.requiresPartnerInfo
    ? "В боте — короткий триплет Вероники по этому вопросу. Полный расклад с данными партнёра — на сайте."
    : item.cardCount > 3
      ? "В боте — триплет Вероники по этому вопросу. Полная схема карт — на сайте."
      : "Можно сделать в боте или на сайте.";

  const text = [
    item.title,
    item.categoryLabel,
    "",
    item.description || "",
    "",
    `На сайте: ${item.cardCount} карт · ориентир ~${item.cost} рун`,
    positions ? `\nПозиции на сайте:\n${positions}` : "",
    "",
    where,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  await replyOrEdit(
    ctx,
    text.slice(0, 3500),
    catalogItemKeyboard({ native: item.native, url: item.url })
  );
}

export async function handleCatalogCallback(ctx: Context, data: string): Promise<boolean> {
  if (!data.startsWith(CB.catPrefix)) return false;
  const user = await ensureOnboarded(ctx);
  if (!user) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    return true;
  }

  await ctx.answerCallbackQuery().catch(() => undefined);
  const tid = user.telegram_user_id;

  if (data === CB.catHome) {
    clearFlow(tid);
    await beginCatalog(ctx);
    return true;
  }

  if (data === CB.catOwn) {
    clearFlow(tid);
    await beginCustomQuestion(ctx);
    return true;
  }

  if (data === CB.catFeat) {
    await showList(ctx, tid, "featured", 0);
    return true;
  }

  if (data === CB.catAll) {
    await showList(ctx, tid, "all", 0);
    return true;
  }

  if (data.startsWith(CB.catCategoryPrefix)) {
    const category = data.slice(CB.catCategoryPrefix.length);
    if (!category) return true;
    await showList(ctx, tid, "category", 0, category);
    return true;
  }

  if (data.startsWith(CB.catPagePrefix)) {
    const page = Number(data.slice(CB.catPagePrefix.length));
    const flow = getFlow(tid);
    if (!flow || flow.flow !== "catalog") {
      await beginCatalog(ctx);
      return true;
    }
    const st = flow.data as unknown as CatalogListState;
    const mode = st.mode || "all";
    await showList(ctx, tid, mode, Number.isFinite(page) ? page : 0, st.category);
    return true;
  }

  if (data.startsWith(CB.catItemPrefix)) {
    const idx = Number(data.slice(CB.catItemPrefix.length));
    const flow = getFlow(tid);
    if (!flow || flow.flow !== "catalog" || flow.step !== "list") {
      await beginCatalog(ctx);
      return true;
    }
    const st = flow.data as unknown as CatalogListState;
    const item = st.items?.[idx];
    if (!item) {
      await replyOrEdit(ctx, copy.catalogEmpty, salonKeyboard());
      return true;
    }
    await showItem(ctx, tid, item.id, st);
    return true;
  }

  if (data === CB.catRun) {
    const flow = getFlow(tid);
    if (!flow || flow.flow !== "catalog" || flow.step !== "detail") {
      await beginCatalog(ctx);
      return true;
    }
    const st = flow.data as unknown as CatalogDetailState;
    if (!st.questionTemplate?.trim()) {
      await ctx.reply("Этот расклад лучше открыть на сайте.", {
        reply_markup: catalogItemKeyboard({
          native: false,
          url: st.url || siteCatalogUrl(),
        }),
      });
      return true;
    }

    const linked = await ensureSiteLinked(ctx);
    if (!linked) return true;

    trackEvent("catalog_native_run", tid, { slug: st.slug });
    clearFlow(tid);
    await runSpreadQuestion(ctx, linked.user, st.questionTemplate, "catalog");
    return true;
  }

  return false;
}
