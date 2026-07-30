import type { Context, InlineKeyboard } from "grammy";
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
} from "../keyboards/index.js";
import { announceWorking, ensureOnboarded } from "./helpers.js";
import { beginCustomQuestion, runSpreadQuestion } from "./spread.js";
import { ensureSiteLinked } from "./site-account.js";

let catalogCopyCounter = 0;

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

function isNotModifiedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /message is not modified/i.test(msg);
}

/** Catalog UI stays on one Telegram message: edit on callbacks, reply only when opening fresh. */
async function renderCatalog(
  ctx: Context,
  text: string,
  reply_markup: InlineKeyboard
): Promise<void> {
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, { reply_markup });
      return;
    } catch (err) {
      if (isNotModifiedError(err)) return;
      console.warn("[catalog] edit failed, falling back to reply", err);
    }
  }
  await ctx.reply(text, { reply_markup });
}

async function showHome(ctx: Context, telegramUserId: number): Promise<void> {
  let result: Awaited<ReturnType<typeof siteCatalog>>;
  try {
    result = await siteCatalog(telegramUserId, { action: "summary" });
  } catch (err) {
    console.error("[catalog] summary failed", err);
    await renderCatalog(
      ctx,
      copy.catalogFailed,
      catalogHomeKeyboard([], siteCatalogUrl())
    );
    return;
  }

  const data = result.data;
  if (!data.ok || !data.categories) {
    await renderCatalog(
      ctx,
      copy.catalogFailed,
      catalogHomeKeyboard([], siteCatalogUrl())
    );
    return;
  }

  setFlow(telegramUserId, "catalog", "home", {});
  trackEvent("catalog_opened", telegramUserId, { total: data.total ?? 0 });

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

  await renderCatalog(ctx, text, catalogHomeKeyboard(data.categories, siteCatalogUrl()));
}

export async function beginCatalog(ctx: Context): Promise<void> {
  const user = await ensureOnboarded(ctx);
  if (!user) return;
  await announceWorking(
    ctx,
    copy.cabinetPreparing(user.telegram_user_id, catalogCopyCounter++)
  );
  await showHome(ctx, user.telegram_user_id);
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
    await renderCatalog(
      ctx,
      copy.catalogFailed,
      catalogHomeKeyboard([], siteCatalogUrl())
    );
    return;
  }

  const data = result.data;
  if (!data.ok || !data.items) {
    await renderCatalog(
      ctx,
      copy.catalogFailed,
      catalogHomeKeyboard([], siteCatalogUrl())
    );
    return;
  }

  if (!data.items.length) {
    await renderCatalog(
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
  await renderCatalog(
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
    await renderCatalog(
      ctx,
      copy.catalogFailed,
      catalogHomeKeyboard([], siteCatalogUrl())
    );
    return;
  }

  const item = result.data.item;
  if (!result.data.ok || !item) {
    await renderCatalog(
      ctx,
      copy.catalogFailed,
      catalogHomeKeyboard([], siteCatalogUrl())
    );
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

  await renderCatalog(
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

  const tid = user.telegram_user_id;

  if (data === CB.catNoop) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    return true;
  }

  await ctx.answerCallbackQuery().catch(() => undefined);

  if (data === CB.catHome) {
    await showHome(ctx, tid);
    return true;
  }

  if (data === CB.catBack) {
    const flow = getFlow(tid);
    if (flow?.flow === "catalog" && (flow.step === "detail" || flow.step === "list")) {
      const st = flow.data as unknown as CatalogListState;
      if (st.mode) {
        await showList(ctx, tid, st.mode, st.page ?? 0, st.category);
        return true;
      }
    }
    await showHome(ctx, tid);
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
      await showHome(ctx, tid);
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
      await showHome(ctx, tid);
      return true;
    }
    const st = flow.data as unknown as CatalogListState;
    const item = st.items?.[idx];
    if (!item) {
      await renderCatalog(
        ctx,
        copy.catalogEmpty,
        catalogHomeKeyboard([], siteCatalogUrl())
      );
      return true;
    }
    await showItem(ctx, tid, item.id, st);
    return true;
  }

  if (data === CB.catRun) {
    const flow = getFlow(tid);
    if (!flow || flow.flow !== "catalog" || flow.step !== "detail") {
      await showHome(ctx, tid);
      return true;
    }
    const st = flow.data as unknown as CatalogDetailState;
    if (!st.questionTemplate?.trim()) {
      await renderCatalog(
        ctx,
        "Этот расклад лучше открыть на сайте.",
        catalogItemKeyboard({
          native: false,
          url: st.url || siteCatalogUrl(),
        })
      );
      return true;
    }

    const linked = await ensureSiteLinked(ctx);
    if (!linked) return true;

    trackEvent("catalog_native_run", tid, { slug: st.slug });
    clearFlow(tid);
    // Reading output is a new conversation thread; leave catalog message as-is.
    await runSpreadQuestion(ctx, linked.user, st.questionTemplate, "catalog");
    return true;
  }

  return false;
}
