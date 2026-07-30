import type { Context, InlineKeyboard } from "grammy";
import { InputFile } from "grammy";
import { botConfig } from "../config.js";
import { copy } from "../copy/ru.js";
import { clearFlow, getFlow, setFlow } from "../db/repos.js";
import {
  chunkTelegramText,
  type SiteMatrixDiagram,
  siteCabinet,
  siteHistory,
  siteHistoryDelete,
  siteNatal,
  siteNumerology,
  siteReading,
  siteSupport,
} from "../domain/site-client.js";
import { presentReadingToTelegram } from "../domain/reading/present.js";
import { buildLocalMatrixDiagram } from "../domain/matrix/calc.js";
import {
  renderHistoryEntryImage,
  type HistoryEntryKind,
} from "../render/history-entry.js";
import { renderMatrixDiagramImage } from "../render/matrix-diagram.js";
import { showPhoto as showPhotoFlow } from "./photo.js";
import {
  CB,
  chatFollowUpKeyboard,
  continueOnSiteKeyboard,
  dialogStopKeyboard,
  historyDeleteConfirmKeyboard,
  historyPagerKeyboard,
  matrixDeleteConfirmKeyboard,
  matrixGetKeyboard,
  matrixListPagerKeyboard,
  matrixNewConfirmKeyboard,
  modulesKeyboard,
  salonKeyboard,
  supportListKeyboard,
} from "../keyboards/index.js";
import {
  formatMatrixPremiumTeaser,
  formatMatrixReadingPremium,
} from "../domain/matrix/format.js";
import { announceWorking } from "./helpers.js";
import { ensureSiteLinked } from "./site-account.js";

let cabinetCopyCounter = 0;

type HistoryItem = {
  sessionId: string;
  characterKey: string;
  kind: HistoryEntryKind;
  date: string;
  topic: string;
  cards: string[];
  preview: string;
};

type HistoryViewState = {
  items: HistoryItem[];
  page: number;
};

type MatrixListItem = {
  id: string;
  birthDate: string;
  date: string;
  preview: string;
  sessionId: string | null;
};

type MatrixListState = {
  items: MatrixListItem[];
  page: number;
};

function isNotModifiedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /message is not modified/i.test(msg);
}

async function editOrReplyText(
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
      console.warn("[cabinet] edit failed, falling back to reply", err);
    }
  }
  await ctx.reply(text, { reply_markup });
}

async function renderHistoryAlbumPage(
  ctx: Context,
  item: HistoryItem,
  page: number,
  total: number
): Promise<void> {
  const markup = historyPagerKeyboard({
    page,
    total,
    sessionId: item.sessionId || null,
  });
  await ctx.replyWithChatAction("upload_photo").catch(() => undefined);
  const buf = await renderHistoryEntryImage({
    kind: item.kind,
    topic: item.topic || item.characterKey || "Расклад",
    date: item.date,
    preview: item.preview,
    cards: item.cards,
    page,
    total,
  });
  const file = new InputFile(buf, `history-${page + 1}.jpg`);
  const hasPhoto = Boolean(
    ctx.callbackQuery?.message && "photo" in ctx.callbackQuery.message
  );
  if (hasPhoto) {
    try {
      await ctx.editMessageMedia(
        { type: "photo", media: file },
        { reply_markup: markup }
      );
      return;
    } catch (err) {
      if (isNotModifiedError(err)) return;
      console.warn("[history] edit media failed, falling back to reply", err);
    }
  } else if (ctx.callbackQuery?.message) {
    try {
      await ctx.deleteMessage();
    } catch {
      /* ignore */
    }
  }
  await ctx.replyWithPhoto(file, { reply_markup: markup });
}

function mapHistoryItems(
  rows: Array<{
    sessionId: string;
    characterKey: string;
    kind?: HistoryEntryKind;
    date: string;
    topic: string;
    cards: string[];
    preview: string;
  }>
): HistoryItem[] {
  return rows.map((r) => ({
    sessionId: r.sessionId,
    characterKey: r.characterKey || "",
    kind: r.kind || (r.characterKey === "numerolog" ? "matrix" : "spread"),
    date: r.date || "",
    topic: r.topic || "",
    cards: r.cards ?? [],
    preview: r.preview || "",
  }));
}

function linkKb(url?: string | null) {
  return url ? continueOnSiteKeyboard(url) : salonKeyboard();
}

export async function showModulesMenu(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  await ctx.reply(copy.modulesPick, { reply_markup: modulesKeyboard() });
}

export async function showCabinetOverview(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteCabinet(linked.user.telegram_user_id);
    if (!data.ok) {
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }
    const lines = [
      copy.cabinetOverviewTitle,
      "",
      `Руны: ${data.runeBalance ?? "—"}`,
      data.natal?.hasChart
        ? `Натал: ${(data.natal.bigThree || []).join(" · ") || "есть карта"}`
        : "Натал: ещё не построен",
      `Обряды: ${data.rituals?.recent?.length ?? 0}`,
      `Совместные: ${data.joint?.items?.length ?? 0}`,
      `Дневник: ${data.diary?.length ?? 0}`,
      `Память: ${data.memory?.length ?? 0}`,
      `Поддержка: ${data.support?.tickets?.length ?? 0}`,
      `Матрицы: ${data.numerology?.matrices?.length ?? 0}`,
      `Фото: ${data.photo?.items?.length ?? 0}`,
    ];
    await ctx.reply(lines.join("\n"), {
      reply_markup: data.urls?.cabinet
        ? continueOnSiteKeyboard(data.urls.cabinet)
        : modulesKeyboard(),
    });
  } catch (err) {
    console.error("[cabinet] overview", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function showNatal(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteNatal(linked.user.telegram_user_id);
    if (!data.ok || !data.natal) {
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }
    if (!data.natal.hasChart) {
      await ctx.reply(copy.natalEmpty, { reply_markup: linkKb(data.natal.url || data.url) });
      return;
    }
    const lines = [
      copy.natalTitle,
      "",
      ...(data.natal.bigThree.length ? data.natal.bigThree : ["Карта сохранена"]),
      data.natal.place ? `Место: ${data.natal.place}` : "",
      "",
      "Полный разбор и транзиты — на сайте.",
    ].filter(Boolean);
    await ctx.reply(lines.join("\n"), { reply_markup: linkKb(data.natal.url || data.url) });
  } catch (err) {
    console.error("[cabinet] natal", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

async function sendMatrixDiagram(
  ctx: Context,
  opts: {
    diagram?: SiteMatrixDiagram | null;
    birthDate?: string | null;
    name?: string | null;
    caption?: string;
  }
): Promise<boolean> {
  const diagram =
    opts.diagram?.slots?.length
      ? opts.diagram
      : opts.birthDate
        ? buildLocalMatrixDiagram(opts.birthDate, opts.name)
        : null;
  if (!diagram?.slots?.length) return false;
  try {
    await ctx.replyWithChatAction("upload_photo");
    const buf = await renderMatrixDiagramImage({
      name: diagram.name ?? opts.name,
      birthDate: diagram.birthDate ?? opts.birthDate ?? undefined,
      slots: diagram.slots,
    });
    // No caption — birth date is already on the diagram; captions render as a narrow strip.
    await ctx.replyWithPhoto(new InputFile(buf, "matrix.jpg"));
    return true;
  } catch (err) {
    console.error("[cabinet] matrix diagram", err);
    return false;
  }
}

type MatrixSummaryData = Awaited<ReturnType<typeof siteNumerology>>["data"];

async function renderMatrixTeaserFromSummary(
  ctx: Context,
  data: MatrixSummaryData
): Promise<void> {
  const caption = [
    "🌌 Матрица судьбы",
    data.name || data.diagram?.name || null,
    data.birthDate || null,
  ]
    .filter(Boolean)
    .join(" · ");
  await sendMatrixDiagram(ctx, {
    diagram: data.diagram,
    birthDate: data.birthDate,
    name: data.name || data.diagram?.name,
    caption,
  });

  const body = formatMatrixPremiumTeaser({
    name: data.name,
    birthDate: data.birthDate,
    portrait: data.portrait,
    moneyInsight: data.moneyInsight,
    loveInsight: data.loveInsight,
    yearInsight: data.yearInsight,
    keyArcana: data.keyArcana,
    cost: data.cost ?? 20,
    runeBalance: data.runeBalance,
  });
  const chunks = chunkTelegramText(body);
  const kb = matrixGetKeyboard({
    cost: data.cost ?? 20,
    shopUrl: data.shopUrl,
  });
  for (let i = 0; i < chunks.length; i++) {
    await ctx.reply(chunks[i]!, {
      reply_markup: i === chunks.length - 1 ? kb : undefined,
    });
  }
}

/** Free diagram + premium teaser + Get / Calculate buttons. */
export async function showMatrixTeaser(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  await announceWorking(
    ctx,
    copy.matrixPreparing(linked.user.telegram_user_id, cabinetCopyCounter++)
  );
  try {
    const { data } = await siteNumerology(linked.user.telegram_user_id, "summary");
    if (!data.ok) {
      if (data.error === "needs_onboarding") {
        await ctx.reply(copy.matrixNeedsBirth, { reply_markup: linkKb(data.linkUrl) });
        return;
      }
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }

    await renderMatrixTeaserFromSummary(ctx, data);
  } catch (err) {
    console.error("[cabinet] matrix teaser", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function showMatrix(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  await announceWorking(
    ctx,
    copy.matrixPreparing(linked.user.telegram_user_id, cabinetCopyCounter++)
  );
  try {
    const { data } = await siteNumerology(linked.user.telegram_user_id, "summary");
    if (!data.ok) {
      if (data.error === "needs_onboarding") {
        await ctx.reply(copy.matrixNeedsBirth, { reply_markup: linkKb(data.linkUrl) });
        return;
      }
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }

    // Owned full report → open entire reading immediately.
    if (data.owned && data.ownedReportId) {
      await openMatrixReport(ctx, data.ownedReportId, {
        siteUrl: data.url,
        showActions: true,
      });
      return;
    }

    // Teaser path: summary already loaded — render without a second "preparing" ping.
    await renderMatrixTeaserFromSummary(ctx, data);
  } catch (err) {
    console.error("[cabinet] matrix", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

function formatMatrixListPage(item: MatrixListItem, page: number, total: number): string {
  return [
    `Матрица · отчёт ${page + 1}/${total}`,
    item.date ? `Дата: ${item.date}` : "",
    item.birthDate ? `Рождение: ${item.birthDate}` : "",
    "",
    item.preview || "—",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function showMatrixReports(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteNumerology(linked.user.telegram_user_id, "list");
    if (!data.ok) {
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }
    const items = (data.items || []) as MatrixListItem[];
    if (!items.length) {
      await ctx.reply(copy.matrixReportsEmpty, {
        reply_markup: matrixGetKeyboard({ cost: 20 }),
      });
      return;
    }
    const state: MatrixListState = { items, page: 0 };
    setFlow(linked.user.telegram_user_id, "matrix_list", "page", state as unknown as Record<string, unknown>);
    const item = items[0]!;
    await editOrReplyText(
      ctx,
      formatMatrixListPage(item, 0, items.length),
      matrixListPagerKeyboard({ page: 0, total: items.length, reportId: item.id })
    );
  } catch (err) {
    console.error("[cabinet] matrix list", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

/** Order / regenerate full matrix. Always replaces any prior saved report. */
export async function runMatrixFull(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  await ctx.reply(copy.matrixRunning);
  try {
    await ctx.replyWithChatAction("typing");
    const { data } = await siteNumerology(linked.user.telegram_user_id, "run", undefined, {
      replace: true,
    });
    if (!data.ok) {
      if (data.error === "insufficient_runes") {
        await ctx.reply(
          copy.matrixInsufficient(data.cost ?? 20, data.runeBalance ?? 0),
          {
            reply_markup: data.linkUrl
              ? continueOnSiteKeyboard(data.linkUrl, "Пополнить руны")
              : salonKeyboard(),
          }
        );
        return;
      }
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }
    await sendMatrixDiagram(ctx, {
      diagram: data.diagram,
      birthDate: data.birthDate,
      caption: data.birthDate ? `🌌 Матрица судьбы · ${data.birthDate}` : "🌌 Матрица судьбы",
    });
    const footer = data.replaced
      ? data.charged
        ? `Новая матрица готова. Предыдущая заменена · списано ${data.charged}ᚢ`
        : "Новая матрица готова. Предыдущая заменена."
      : data.charged
        ? `Списано ${data.charged}ᚢ`
        : undefined;
    await presentReadingToTelegram(ctx, {
      reading: formatMatrixReadingPremium(data.content || ""),
      cardNames: [],
      question: "Матрица судьбы",
      sessionId: data.sessionId,
      footer,
      matrixActions: true,
      matrixSiteUrl: data.url,
    });
  } catch (err) {
    console.error("[cabinet] matrix run", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function openMatrixReport(
  ctx: Context,
  reportId: string,
  opts?: { siteUrl?: string | null; showActions?: boolean }
): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteNumerology(linked.user.telegram_user_id, "get", reportId);
    if (!data.ok || !data.content) {
      await ctx.reply(data.message || copy.matrixReportsEmpty, {
        reply_markup: salonKeyboard(),
      });
      return;
    }
    await sendMatrixDiagram(ctx, {
      diagram: data.diagram,
      birthDate: data.birthDate,
      caption: data.birthDate ? `🌌 Матрица судьбы · ${data.birthDate}` : "🌌 Матрица судьбы",
    });
    await presentReadingToTelegram(ctx, {
      reading: formatMatrixReadingPremium(data.content),
      cardNames: [],
      question: "Матрица судьбы",
      sessionId: data.sessionId || undefined,
      matrixActions: opts?.showActions !== false,
      matrixSiteUrl: opts?.siteUrl || data.url,
    });
  } catch (err) {
    console.error("[cabinet] matrix get", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function deleteMatrixReport(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteNumerology(linked.user.telegram_user_id, "delete");
    if (!data.ok) {
      await ctx.reply(data.message || "Не удалось удалить матрицу.", {
        reply_markup: salonKeyboard(),
      });
      return;
    }
    clearFlow(linked.user.telegram_user_id);
    const shopUrl = `${botConfig.siteUrl}/cabinet?shop=1&utm_source=telegram&utm_medium=bot&utm_campaign=matrix`;
    await ctx.reply("🗑 Матрица удалена. Можно рассчитать схему и получить новый разбор.", {
      reply_markup: matrixGetKeyboard({ cost: 20, shopUrl }),
    });
  } catch (err) {
    console.error("[cabinet] matrix delete", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function handleMatrixCallback(ctx: Context, data: string): Promise<boolean> {
  if (!data.startsWith(CB.mxPrefix)) return false;
  const tid = ctx.from?.id;
  if (!tid) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    return true;
  }

  if (data === CB.mxNoop) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    return true;
  }

  if (data === CB.mxRun) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await runMatrixFull(ctx);
    return true;
  }

  if (data === CB.mxNew) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await ctx.reply(
      "Заказать новую матрицу? Старый полный разбор будет затёрт, руны спишутся снова.",
      { reply_markup: matrixNewConfirmKeyboard(20) }
    );
    return true;
  }

  if (data === CB.mxNewNo) {
    await ctx.answerCallbackQuery({ text: "Отменено" }).catch(() => undefined);
    return true;
  }

  if (data === CB.mxNewYes) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await runMatrixFull(ctx);
    return true;
  }

  if (data === CB.mxCalc) {
    await ctx.answerCallbackQuery({ text: "Считаю схему…" }).catch(() => undefined);
    await showMatrixTeaser(ctx);
    return true;
  }

  if (data === CB.mxDel) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await ctx.reply(
      "Удалить сохранённую матрицу? Полный разбор пропадёт — получить снова можно за руны.",
      { reply_markup: matrixDeleteConfirmKeyboard() }
    );
    return true;
  }

  if (data === CB.mxDelNo) {
    await ctx.answerCallbackQuery({ text: "Отменено" }).catch(() => undefined);
    await ctx.reply("Оставила как было.", { reply_markup: salonKeyboard() });
    return true;
  }

  if (data === CB.mxDelYes) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await deleteMatrixReport(ctx);
    return true;
  }

  if (data === CB.mxList) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await showMatrixReports(ctx);
    return true;
  }

  if (data.startsWith(CB.mxOpenPrefix)) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const reportId = data.slice(CB.mxOpenPrefix.length);
    if (reportId) await openMatrixReport(ctx, reportId, { showActions: true });
    return true;
  }

  if (!data.startsWith(CB.mxPagePrefix)) return false;

  const page = Number(data.slice(CB.mxPagePrefix.length));
  const flow = getFlow(tid);
  if (!flow || flow.flow !== "matrix_list" || !Array.isArray(flow.data.items)) {
    await ctx.answerCallbackQuery({ text: "Откройте список снова" }).catch(() => undefined);
    await showMatrixReports(ctx);
    return true;
  }

  const items = flow.data.items as MatrixListItem[];
  if (!items.length) {
    await ctx.answerCallbackQuery({ text: "Пусто" }).catch(() => undefined);
    return true;
  }

  const nextPage = Math.min(Math.max(0, Number.isFinite(page) ? page : 0), items.length - 1);
  setFlow(tid, "matrix_list", "page", { items, page: nextPage } as unknown as Record<string, unknown>);
  const item = items[nextPage]!;
  try {
    await editOrReplyText(
      ctx,
      formatMatrixListPage(item, nextPage, items.length),
      matrixListPagerKeyboard({
        page: nextPage,
        total: items.length,
        reportId: item.id,
      })
    );
    await ctx
      .answerCallbackQuery({ text: `${nextPage + 1} / ${items.length}` })
      .catch(() => undefined);
  } catch (err) {
    console.error("[cabinet] matrix page", err);
    await ctx.answerCallbackQuery({ text: "Не удалось перелистнуть" }).catch(() => undefined);
  }
  return true;
}

export async function showRituals(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteCabinet(linked.user.telegram_user_id);
    if (!data.ok) {
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }
    const recent = data.rituals?.recent ?? [];
    if (!recent.length) {
      await ctx.reply(copy.ritualsEmpty, { reply_markup: linkKb(data.rituals?.url) });
      return;
    }
    const lines = [
      "Обряды",
      "",
      ...recent.map(
        (r, i) => `${i + 1}. ${r.title} · ${r.status}${r.characterKey ? ` · ${r.characterKey}` : ""}`
      ),
      "",
      "Новый обряд и полная карточка — на сайте.",
    ];
    await ctx.reply(lines.join("\n"), { reply_markup: linkKb(data.rituals?.url) });
  } catch (err) {
    console.error("[cabinet] rituals", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function showJoint(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteCabinet(linked.user.telegram_user_id);
    if (!data.ok) {
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }
    const items = data.joint?.items ?? [];
    if (!items.length) {
      await ctx.reply(copy.jointEmpty, { reply_markup: linkKb(data.joint?.url) });
      return;
    }
    const lines = [
      "Совместные расклады",
      "",
      ...items.map(
        (j, i) => `${i + 1}. ${j.status} · ${String(j.createdAt).slice(0, 10)}\n${j.url}`
      ),
    ];
    await ctx.reply(lines.join("\n\n").slice(0, 3500), {
      reply_markup: linkKb(data.joint?.url),
    });
  } catch (err) {
    console.error("[cabinet] joint", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function showDiary(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteCabinet(linked.user.telegram_user_id);
    if (!data.ok) {
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }
    const entries = data.diary ?? [];
    if (!entries.length) {
      await ctx.reply(copy.diaryEmpty, { reply_markup: linkKb(data.urls?.cabinet) });
      return;
    }
    const lines = entries.map(
      (d, i) =>
        `${i + 1}. ${d.characterKey || "запись"} · ${String(d.createdAt).slice(0, 10)}\n${d.text}`
    );
    await ctx.reply(lines.join("\n\n").slice(0, 3500), {
      reply_markup: linkKb(data.urls?.cabinet),
    });
  } catch (err) {
    console.error("[cabinet] diary", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function showMemory(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteCabinet(linked.user.telegram_user_id);
    if (!data.ok) {
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }
    const facts = data.memory ?? [];
    if (!facts.length) {
      await ctx.reply(copy.memoryEmpty, { reply_markup: linkKb(data.urls?.cabinet) });
      return;
    }
    const lines = facts.map(
      (f, i) => `${i + 1}. ${f.category ? `[${f.category}] ` : ""}${f.fact}`
    );
    await ctx.reply(lines.join("\n\n").slice(0, 3500), {
      reply_markup: linkKb(data.urls?.cabinet),
    });
  } catch (err) {
    console.error("[cabinet] memory", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export const showPhoto = showPhotoFlow;

export async function showSupport(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteSupport(linked.user.telegram_user_id, "list");
    if (!data.ok) {
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }
    const tickets = data.tickets ?? [];
    if (!tickets.length) {
      // From profile / modules — empty inbox goes straight into the ticket form.
      await beginSupportCreate(ctx);
      return;
    }
    const lines = [
      copy.supportTitle,
      "",
      ...tickets.map(
        (t, i) =>
          `${i + 1}. ${t.subject} · ${t.status}${t.preview ? `\n${t.preview}` : ""}`
      ),
    ];
    await ctx.reply(lines.join("\n\n").slice(0, 3500), {
      reply_markup: supportListKeyboard(tickets, data.url),
    });
  } catch (err) {
    console.error("[cabinet] support", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function beginSupportCreate(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  setFlow(linked.user.telegram_user_id, "support", "await_message", {});
  await ctx.reply(copy.supportAskMessage, {
    reply_markup: dialogStopKeyboard(),
  });
}

export async function beginSupportReply(ctx: Context, ticketId: string): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  setFlow(linked.user.telegram_user_id, "support", "await_reply", { ticketId });
  await ctx.reply(copy.supportAskReply, {
    reply_markup: dialogStopKeyboard(),
  });
}

/** Bot no longer runs follow-up Q&A — send user to the site session chat. */
export async function beginChatFollowUp(ctx: Context, sessionId: string): Promise<void> {
  if (!ctx.from) return;
  clearFlow(ctx.from.id);
  await ctx.reply(
    "Вопросы по раскладу — на сайте, в том же сеансе. Нажмите кнопку ниже.",
    { reply_markup: chatFollowUpKeyboard(sessionId) }
  );
}

export async function stopActiveDialog(ctx: Context): Promise<void> {
  if (!ctx.from) return;
  clearFlow(ctx.from.id);
  await ctx.reply(copy.chatStopped, { reply_markup: salonKeyboard() });
}

export async function showHistory(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;

  await announceWorking(
    ctx,
    copy.cabinetPreparing(linked.user.telegram_user_id, cabinetCopyCounter++)
  );
  try {
    // Always refetch from site — never trust a stale local snapshot after deletes.
    const { data } = await siteHistory(linked.user.telegram_user_id, 40);
    if (!data.ok || !data.items?.length) {
      clearFlow(linked.user.telegram_user_id);
      await ctx.reply(copy.historyEmpty, { reply_markup: salonKeyboard() });
      return;
    }

    const items = mapHistoryItems(data.items);
    const state: HistoryViewState = { items, page: 0 };
    setFlow(
      linked.user.telegram_user_id,
      "history_view",
      "page",
      state as unknown as Record<string, unknown>
    );

    await renderHistoryAlbumPage(ctx, items[0]!, 0, items.length);
  } catch (err) {
    console.error("[history] site", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function handleHistoryCallback(ctx: Context, data: string): Promise<boolean> {
  if (!data.startsWith(CB.histPrefix)) return false;
  const tid = ctx.from?.id;
  if (!tid) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    return true;
  }

  if (data === CB.histNoop) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    return true;
  }
  if (data === CB.histDelNo) {
    await ctx.answerCallbackQuery({ text: "Оставила" }).catch(() => undefined);
    return true;
  }

  if (data.startsWith(CB.histOpenPrefix)) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const sessionId = data.slice(CB.histOpenPrefix.length);
    if (sessionId) await openHistoryReading(ctx, sessionId);
    return true;
  }

  if (data.startsWith(CB.histAskPrefix)) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const sessionId = data.slice(CB.histAskPrefix.length);
    if (sessionId) await beginChatFollowUp(ctx, sessionId);
    return true;
  }

  if (data.startsWith(CB.histDelYesPrefix)) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const sessionId = data.slice(CB.histDelYesPrefix.length);
    if (sessionId) await deleteHistoryEntry(ctx, sessionId);
    return true;
  }

  if (data.startsWith(CB.histDelPrefix)) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const sessionId = data.slice(CB.histDelPrefix.length);
    if (sessionId) {
      await ctx.reply("Удалить эту запись из истории Zovus?", {
        reply_markup: historyDeleteConfirmKeyboard(sessionId),
      });
    }
    return true;
  }

  if (!data.startsWith(CB.histPagePrefix)) {
    return false;
  }

  const page = Number(data.slice(CB.histPagePrefix.length));
  // Refetch so deleted site/bot items disappear without reopening /history.
  try {
    const linked = await ensureSiteLinked(ctx);
    if (!linked) return true;
    const { data: hist } = await siteHistory(linked.user.telegram_user_id, 40);
    if (!hist.ok || !hist.items?.length) {
      clearFlow(tid);
      await ctx.answerCallbackQuery({ text: "История пуста" }).catch(() => undefined);
      await ctx.reply(copy.historyEmpty, { reply_markup: salonKeyboard() });
      return true;
    }
    const items = mapHistoryItems(hist.items);
    const nextPage = Math.min(Math.max(0, Number.isFinite(page) ? page : 0), items.length - 1);
    setFlow(tid, "history_view", "page", {
      items,
      page: nextPage,
    } as unknown as Record<string, unknown>);
    await renderHistoryAlbumPage(ctx, items[nextPage]!, nextPage, items.length);
    await ctx
      .answerCallbackQuery({ text: `${nextPage + 1} / ${items.length}` })
      .catch(() => undefined);
  } catch (err) {
    console.error("[history] page edit failed", err);
    await ctx.answerCallbackQuery({ text: "Не удалось перелистнуть" }).catch(() => undefined);
  }
  return true;
}

async function deleteHistoryEntry(ctx: Context, sessionId: string): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteHistoryDelete(linked.user.telegram_user_id, sessionId);
    if (!data.ok) {
      await ctx.reply(data.message || "Запись уже удалена.", {
        reply_markup: salonKeyboard(),
      });
      await showHistory(ctx);
      return;
    }
    clearFlow(linked.user.telegram_user_id);
    await ctx.reply("🗑 Запись удалена из истории.", { reply_markup: salonKeyboard() });
    await showHistory(ctx);
  } catch (err) {
    console.error("[history] delete", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function openHistoryReading(ctx: Context, sessionId: string): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    const { data } = await siteReading(linked.user.telegram_user_id, sessionId);
    if (!data.ok || !data.reading) {
      await ctx.reply("Эта запись уже удалена.", { reply_markup: salonKeyboard() });
      await showHistory(ctx);
      return;
    }
    await ctx.replyWithChatAction("upload_photo");
    const isMatrix =
      data.characterKey === "numerolog" ||
      data.intention === "destiny_matrix";
    if (isMatrix) {
      try {
        const { data: mx } = await siteNumerology(linked.user.telegram_user_id, "summary");
        await sendMatrixDiagram(ctx, {
          diagram: mx.diagram,
          birthDate: mx.birthDate,
          name: linked.user.first_name || null,
        });
      } catch {
        /* diagram optional */
      }
      await presentReadingToTelegram(ctx, {
        reading: formatMatrixReadingPremium(data.reading),
        cardNames: [],
        question: "Матрица судьбы",
        sessionId,
        matrixActions: true,
      });
      return;
    }
    await presentReadingToTelegram(ctx, {
      reading: data.reading,
      cardNames: data.cards || [],
      question: data.intention,
      sessionId,
    });
  } catch (err) {
    console.error("[cabinet] reading", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

/** Handle free text for chat / support flows. Returns true if consumed. */
export async function handleCabinetText(ctx: Context, text: string): Promise<boolean> {
  if (!ctx.from) return false;
  const flow = getFlow(ctx.from.id);
  if (!flow) return false;

  if (flow.flow === "photo") {
    const { handlePhotoText } = await import("./photo.js");
    if (await handlePhotoText(ctx, text)) return true;
  }

  if (flow.flow === "chat" && flow.step === "await_message") {
    const sessionId = typeof flow.data.sessionId === "string" ? flow.data.sessionId : "";
    clearFlow(ctx.from.id);
    if (sessionId) {
      await beginChatFollowUp(ctx, sessionId);
      return true;
    }
    return false;
  }

  if (flow.flow === "support" && flow.step === "await_message") {
    const linked = await ensureSiteLinked(ctx);
    if (!linked) return true;
    try {
      const { data } = await siteSupport(linked.user.telegram_user_id, "create", {
        message: text,
      });
      clearFlow(linked.user.telegram_user_id);
      if (!data.ok) {
        await ctx.reply(data.message || copy.siteBridgeDown, {
          reply_markup: linkKb(data.linkUrl),
        });
        return true;
      }
      const reply = [copy.supportCreated, data.autoReply || ""].filter(Boolean).join("\n\n");
      await ctx.reply(reply.slice(0, 3500), { reply_markup: salonKeyboard() });
    } catch (err) {
      console.error("[cabinet] support create", err);
      clearFlow(linked.user.telegram_user_id);
      await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
    }
    return true;
  }

  if (flow.flow === "support" && flow.step === "await_reply") {
    const ticketId = typeof flow.data.ticketId === "string" ? flow.data.ticketId : "";
    if (!ticketId) {
      clearFlow(ctx.from.id);
      return false;
    }
    const linked = await ensureSiteLinked(ctx);
    if (!linked) return true;
    try {
      const { data } = await siteSupport(linked.user.telegram_user_id, "reply", {
        ticketId,
        message: text,
      });
      clearFlow(linked.user.telegram_user_id);
      if (!data.ok) {
        await ctx.reply(data.message || copy.siteBridgeDown, {
          reply_markup: linkKb(data.linkUrl),
        });
        return true;
      }
      const thread = (data.messages || [])
        .map((m) => `${m.role === "admin" ? "Поддержка" : "Вы"}: ${m.content}`)
        .join("\n\n");
      await ctx.reply((thread || "Сообщение отправлено.").slice(0, 3500), {
        reply_markup: salonKeyboard(),
      });
    } catch (err) {
      console.error("[cabinet] support reply", err);
      clearFlow(linked.user.telegram_user_id);
      await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
    }
    return true;
  }

  return false;
}

export async function routeModuleCallback(ctx: Context, data: string): Promise<boolean> {
  switch (data) {
    case CB.modNatal:
      await showNatal(ctx);
      return true;
    case CB.modMatrix:
      await showMatrix(ctx);
      return true;
    case CB.modRituals:
      await showRituals(ctx);
      return true;
    case CB.modJoint:
      await showJoint(ctx);
      return true;
    case CB.modDiary:
      await showDiary(ctx);
      return true;
    case CB.modMemory:
      await showMemory(ctx);
      return true;
    case CB.modPhoto:
      await showPhoto(ctx);
      return true;
    case CB.modSupport:
      await showSupport(ctx);
      return true;
    case CB.modCabinet:
      await showCabinetOverview(ctx);
      return true;
    case CB.chatStop:
      await stopActiveDialog(ctx);
      return true;
    case CB.supportNew:
      await beginSupportCreate(ctx);
      return true;
    default:
      return false;
  }
}
