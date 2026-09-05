import type { Context, InlineKeyboard } from "grammy";
import { randomBytes } from 'node:crypto';
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
import { beginCustomQuestion, runCatalogIntent } from "./spread.js";
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
    runMode: "exact" | "approx" | "site_only";
    url: string;
    cost: number;
    botCost: number;
    cardCount: number;
    questionTemplate: string;
  }>;
  totalPages: number;
  total: number;
};

type CatalogDetailState = CatalogListState & {
  confirmationId: string;
  slug: string;
  title: string;
  description: string;
  native: boolean;
  runMode: "exact" | "approx" | "site_only";
  url: string;
  questionTemplate: string;
  cost: number;
  botCost: number;
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
    runMode: i.runMode ?? (i.native ? "exact" : "site_only"),
    url: i.url,
    cost: i.cost,
    botCost: i.botCost ?? i.cost ?? 15,
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

  const runMode =
    item.runMode ?? (item.native ? "exact" : "site_only");
  const botCost = item.botCost ?? item.cost ?? 15;
  const detail: CatalogDetailState = {
    ...listState,
    slug: item.id,
    title: item.title,
    confirmationId: randomBytes(6).toString('hex'),
    description: item.description,
    native: item.native,
    runMode,
    url: item.url,
    questionTemplate: item.questionTemplate,
    cost: item.cost,
    botCost,
    cardCount: item.cardCount,
    categoryLabel: item.categoryLabel,
    positionsPreview: item.positionsPreview || [],
  };
  setFlow(telegramUserId, "catalog", "detail", detail as unknown as Record<string, unknown>);
  trackEvent("catalog_item_opened", telegramUserId, {
    slug: item.id,
    native: item.native,
    run_mode: runMode,
    spread_id: item.spreadId,
  });

  const positions = (item.positionsPreview || [])
    .slice(0, 5)
    .map((p) => `· ${p}`)
    .join("\n");
  const where =
    runMode === "site_only"
      ? item.requiresPartnerInfo
        ? "Этот расклад с данными партнёра — только на сайте."
        : "Этот расклад — только на сайте."
      : `В боте: полный расклад (${item.cardCount} карт) · ${botCost}ᚢ — как на сайте.`;

  const text = [
    item.title,
    item.categoryLabel,
    "",
    item.description || "",
    "",
    `${item.cardCount} карт · ${botCost} рун`,
    positions ? `\nПозиции:\n${positions}` : "",
    "",
    where,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  await renderCatalog(
    ctx,
    text.slice(0, 3500),
    catalogItemKeyboard({
      native: item.native,
      url: item.url,
      runMode,
      botCost,
      confirmationId: detail.confirmationId,
    })
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

  if (data === CB.catRun || data.startsWith(`${CB.catRun}:`)) {
    const flow = getFlow(tid);
    if (!flow || flow.flow !== "catalog" || flow.step !== "detail") {
      await showHome(ctx, tid);
      return true;
    }
    const st = flow.data as unknown as CatalogDetailState;
    if (data !== `${CB.catRun}:${st.confirmationId}`) {
      await ctx.reply('Это прежнее подтверждение. Откройте нужный расклад в каталоге и проверьте стоимость ещё раз.');
      return true;
    }
    if (!st.questionTemplate?.trim() || st.runMode === "site_only") {
      await renderCatalog(
        ctx,
        "Этот расклад лучше открыть на сайте.",
        catalogItemKeyboard({
          native: false,
          url: st.url || siteCatalogUrl(),
          runMode: "site_only",
        })
      );
      return true;
    }

    const linked = await ensureSiteLinked(ctx);
    if (!linked) return true;

    trackEvent("catalog_native_run", tid, {
      slug: st.slug,
      run_mode: st.runMode,
      bot_cost: st.botCost,
      card_count: st.cardCount,
    });
    // Preserve the drawing operation key until the site result is delivered;
    // a timeout/retry must reuse the same idempotency key across navigation.
    await runCatalogIntent(ctx, linked.user, st.slug, st.questionTemplate);
    return true;
  }

  return false;
}
