import type { Context } from "grammy";
import { InputFile, InlineKeyboard } from "grammy";
import { botConfig } from "../config.js";
import { copy } from "../copy/ru.js";
import { clearFlow, getFlow, setFlow, trackEvent } from "../db/repos.js";
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
import {
  jumpReadingAlbumPage,
  presentReadingToTelegram,
} from "../domain/reading/present.js";
import { buildLocalMatrixDiagram } from "../domain/matrix/calc.js";
import {
  renderHistoryEntryImage,
  type HistoryEntryKind,
} from "../render/history-entry.js";
import { renderMatrixDiagramImage } from "../render/matrix-diagram.js";
import { renderMatrixShareCardImage } from "../render/matrix-share-card.js";
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
  matrixOwnedKeyboard,
  salonKeyboard,
  supportListKeyboard,
} from "../keyboards/index.js";
import { formatMatrixPremiumTeaser } from "../domain/matrix/format.js";
import { replyPhotoBudget } from "../domain/tg-send.js";
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
        : salonKeyboard(),
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
    focusKey?: string | null;
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
    await ctx.replyWithChatAction("upload_photo").catch(() => undefined);
    const buf = await renderMatrixDiagramImage({
      name: diagram.name ?? opts.name,
      birthDate: diagram.birthDate ?? opts.birthDate ?? undefined,
      slots: diagram.slots,
      focusKey: opts.focusKey ?? diagram.focusKey ?? null,
    });
    // No caption — birth date is already on the diagram; captions render as a narrow strip.
    return replyPhotoBudget(ctx, buf, "matrix.jpg");
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
  const body = formatMatrixPremiumTeaser({
    name: data.name,
    birthDate: data.birthDate,
    portrait: data.portrait,
    moneyInsight: data.moneyInsight,
    loveInsight: data.loveInsight,
    yearInsight: data.yearInsight,
    comfortInsight: data.comfortInsight,
    karmicInsight: data.karmicInsight,
    ageInsight: data.ageInsight,
    periodTeaser: data.periodTeaser,
    denseTeaser: data.denseTeaser,
    keyArcana: data.keyArcana,
    cost: data.cost ?? 20,
    runeBalance: data.runeBalance,
  });
  const chunks = chunkTelegramText(body);
  const kb = matrixGetKeyboard({
    cost: data.cost ?? 20,
    shopUrl: data.shopUrl,
    runeBalance: data.runeBalance,
  });
  // Text first so a hung sendPhoto cannot strand the user on "Собираю матрицу".
  for (let i = 0; i < chunks.length; i++) {
    await ctx.reply(chunks[i]!, {
      reply_markup: i === chunks.length - 1 ? kb : undefined,
    });
  }

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
    focusKey: data.focusKey ?? data.diagram?.focusKey,
  });
}

/** Free diagram + premium teaser + Get / Calculate buttons. */
export async function showMatrixTeaser(ctx: Context): Promise<void> {
  const uid = ctx.from?.id;
  if (uid) {
    await announceWorking(ctx, copy.matrixPreparing(uid, cabinetCopyCounter++));
  }
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
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
  const uid = ctx.from?.id;
  if (uid) {
    await announceWorking(ctx, copy.matrixPreparing(uid, cabinetCopyCounter++));
  }
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
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
      const emptyCost = Number(
        (data as { cost?: number; sessionCost?: number }).cost ??
          (data as { sessionCost?: number }).sessionCost
      );
      await ctx.reply(copy.matrixReportsEmpty, {
        reply_markup: matrixGetKeyboard({
          cost: Number.isFinite(emptyCost) && emptyCost > 0 ? emptyCost : 20,
        }),
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
  const activeFlow = getFlow(linked.user.telegram_user_id);
  const subjectId =
    activeFlow?.flow === "matrix_subject" &&
    typeof activeFlow.data?.subjectId === "string"
      ? activeFlow.data.subjectId
      : undefined;
  await ctx.reply(copy.matrixRunning);
  try {
    await ctx.replyWithChatAction("typing");
    const { data } = await siteNumerology(linked.user.telegram_user_id, "run", undefined, {
      replace: true,
      ...(subjectId ? { subjectId } : {}),
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
    const footer = data.replaced
      ? data.charged
        ? `Новая матрица готова. Предыдущая заменена · списано ${data.charged}ᚢ`
        : "Новая матрица готова. Предыдущая заменена."
      : data.charged
        ? `Списано ${data.charged}ᚢ`
        : undefined;
    await presentReadingToTelegram(ctx, {
      reading: data.content || "",
      cardNames: [],
      sessionId: data.sessionId,
      footer,
      matrixActions: true,
      matrixPaging: true,
      matrixSiteUrl: data.url,
    });
    await sendMatrixDiagram(ctx, {
      diagram: data.diagram,
      birthDate: data.birthDate,
      caption: data.birthDate ? `🌌 Матрица судьбы · ${data.birthDate}` : "🌌 Матрица судьбы",
      focusKey: data.diagram?.focusKey ?? data.focusKey,
    });
    trackEvent("matrix_full_ready", linked.user.telegram_user_id, {
      sessionId: data.sessionId ?? null,
      charged: data.charged ?? 0,
    });
  } catch (err) {
    console.error("[cabinet] matrix run", err);
    // Server may finish after undici/headers timeout — try to pull a just-saved report.
    try {
      const owned = await siteNumerology(linked.user.telegram_user_id, "list");
      const latest = owned.data.items?.[0];
      if (owned.data.ok && latest?.id) {
        const ageMs = Date.now() - new Date(latest.date).getTime();
        if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 10 * 60_000) {
          await openMatrixReport(ctx, latest.id, { showActions: true });
          return;
        }
      }
    } catch (recoverErr) {
      console.warn("[cabinet] matrix run recovery failed", recoverErr);
    }
    await ctx.reply(copy.matrixStillWorking, { reply_markup: salonKeyboard() });
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
    await presentReadingToTelegram(ctx, {
      reading: data.content,
      cardNames: [],
      sessionId: data.sessionId || undefined,
      matrixActions: opts?.showActions !== false,
      matrixPaging: true,
      matrixSiteUrl: opts?.siteUrl || data.url,
    });
    await sendMatrixDiagram(ctx, {
      diagram: data.diagram,
      birthDate: data.birthDate,
      caption: data.birthDate ? `🌌 Матрица судьбы · ${data.birthDate}` : "🌌 Матрица судьбы",
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
    const cost =
      typeof data.cost === "number" && Number.isFinite(data.cost) ? data.cost : 20;
    const shopUrl = `${botConfig.siteUrl}/cabinet?shop=1&utm_source=telegram&utm_medium=bot&utm_campaign=matrix`;
    await ctx.reply("🗑 Матрица удалена. Можно получить новый полный разбор.", {
      reply_markup: matrixGetKeyboard({
        cost,
        shopUrl,
        runeBalance:
          typeof data.runeBalance === "number" ? data.runeBalance : null,
      }),
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

  if (data === CB.mxSubjects) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const linked = await ensureSiteLinked(ctx);
    if (!linked) return true;
    const { data: subjects } = await siteNumerology(linked.user.telegram_user_id, "subjects");
    if (!subjects.ok) {
      await ctx.reply(subjects.message || copy.siteBridgeDown, { reply_markup: salonKeyboard() });
      return true;
    }
    const items = subjects.subjects || [];
    const kb = new InlineKeyboard();
    for (const subject of items) {
      const name = subject.displayName || (subject.kind === "self" ? "Я" : subject.kind);
      kb.text(`${name} · ${subject.birthDate}`.slice(0, 60), `${CB.mxSubjectSelectPrefix}${subject.id}`).row();
    }
    kb.text("➕ Добавить", CB.mxSubjectNew);
    await ctx.reply("Чья матрица?", { reply_markup: kb });
    return true;
  }

  if (data.startsWith(CB.mxSubjectSelectPrefix)) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const subjectId = data.slice(CB.mxSubjectSelectPrefix.length);
    const linked = await ensureSiteLinked(ctx);
    if (!linked || !subjectId) return true;
    setFlow(linked.user.telegram_user_id, "matrix_subject", "active", { subjectId });
    const { data: summary } = await siteNumerology(linked.user.telegram_user_id, "summary", undefined, { subjectId });
    if (!summary.ok) {
      await ctx.reply(summary.message || copy.siteBridgeDown, { reply_markup: salonKeyboard() });
      return true;
    }
    await renderMatrixTeaserFromSummary(ctx, summary);
    return true;
  }

  if (data === CB.mxSubjectNew) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const linked = await ensureSiteLinked(ctx);
    if (!linked) return true;
    const kb = new InlineKeyboard()
      .text("🧸 Ребёнок", `${CB.mxSubjectKindPrefix}child`)
      .row()
      .text("💞 Партнёр", `${CB.mxSubjectKindPrefix}partner`)
      .row()
      .text("👤 Другой человек", `${CB.mxSubjectKindPrefix}other`);
    await ctx.reply("Кого добавить?", { reply_markup: kb });
    return true;
  }

  if (data.startsWith(CB.mxSubjectKindPrefix)) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const kind = data.slice(CB.mxSubjectKindPrefix.length);
    if (kind !== "child" && kind !== "partner" && kind !== "other") return true;
    const linked = await ensureSiteLinked(ctx);
    if (!linked) return true;
    setFlow(linked.user.telegram_user_id, "matrix_subject", "dob", { kind });
    await ctx.reply(
      "Введите дату рождения (ДД.ММ.ГГГГ).\nДля ребёнка можно указать любой возраст от 0 лет."
    );
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

  if (data === CB.mxPeriod) {
    await ctx.answerCallbackQuery({ text: "Узел периода…" }).catch(() => undefined);
    const linked = await ensureSiteLinked(ctx);
    if (!linked) return true;
    try {
      const { data: summary } = await siteNumerology(linked.user.telegram_user_id, "summary");
      if (!summary.ok) {
        await ctx.reply(summary.message || copy.siteBridgeDown, {
          reply_markup: linkKb(summary.linkUrl),
        });
        return true;
      }
      await sendMatrixDiagram(ctx, {
        diagram: summary.diagram,
        birthDate: summary.birthDate,
        name: summary.name,
        focusKey: summary.focusKey ?? summary.diagram?.focusKey,
      });
      const teaser =
        summary.periodTeaser ||
        [
          summary.focusLabel ? `Фокус: ${summary.focusLabel}` : null,
          summary.ageInsight,
          summary.yearInsight,
        ]
          .filter(Boolean)
          .join("\n");
      const since = summary.sinceLast ? `\n\n${summary.sinceLast}` : "";
      await ctx.reply(
        ["📅 Узел периода (бесплатно)", teaser || "Откройте схему матрицы ещё раз.", since]
          .filter(Boolean)
          .join("\n\n"),
        {
          reply_markup: summary.owned
            ? matrixOwnedKeyboard({ siteUrl: summary.url })
            : matrixGetKeyboard({
                cost: summary.cost ?? 20,
                shopUrl: summary.shopUrl,
                runeBalance: summary.runeBalance,
              }),
        }
      );
    } catch (err) {
      console.error("[cabinet] matrix period", err);
      await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
    }
    return true;
  }

  if (data === CB.mxZones) {
    // Inside full-report album: jump to first zone page (‹ › already browse zones).
    const flow = getFlow(tid);
    if (
      flow?.flow === "reading_view" &&
      flow.data.matrixActions &&
      Array.isArray(flow.data.pages) &&
      flow.data.pages.length > 0
    ) {
      const ok = await jumpReadingAlbumPage(ctx, 0, "Зоны · 1 страница");
      if (ok) return true;
    }

    await ctx.answerCallbackQuery({ text: "Зоны…" }).catch(() => undefined);
    const linked = await ensureSiteLinked(ctx);
    if (!linked) return true;
    try {
      const { data: summary } = await siteNumerology(linked.user.telegram_user_id, "summary");
      if (!summary.ok) {
        await ctx.reply(summary.message || copy.siteBridgeDown, {
          reply_markup: linkKb(summary.linkUrl),
        });
        return true;
      }
      // Owned, album not open: open full report so ‹ › browse zones.
      if (summary.owned && summary.ownedReportId) {
        await openMatrixReport(ctx, summary.ownedReportId, { siteUrl: summary.url });
        return true;
      }

      await sendMatrixDiagram(ctx, {
        diagram: summary.diagram,
        birthDate: summary.birthDate,
        name: summary.name,
        focusKey: summary.focusKey ?? summary.diagram?.focusKey,
      });
      const zones = [
        summary.comfortInsight,
        summary.karmicInsight,
        summary.ageInsight,
        summary.moneyInsight,
        summary.loveInsight,
        summary.yearInsight,
        summary.periodTeaser,
      ]
        .filter(Boolean)
        .join("\n\n");
      await ctx.reply(
        [
          "🗺 Зоны полной матрицы",
          zones || summary.portrait || "",
          "Схема и краткие зоны бесплатно. Полный разбор по зонам — после покупки.",
        ]
          .filter(Boolean)
          .join("\n\n"),
        {
          reply_markup: matrixGetKeyboard({
            cost: summary.cost ?? 20,
            shopUrl: summary.shopUrl,
            runeBalance: summary.runeBalance,
          }),
        }
      );
    } catch (err) {
      console.error("[cabinet] matrix zones", err);
      await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
    }
    return true;
  }

  if (data === CB.mxShare) {
    await ctx.answerCallbackQuery({ text: "Карточка…" }).catch(() => undefined);
    const linked = await ensureSiteLinked(ctx);
    if (!linked) return true;
    try {
      const { data: summary } = await siteNumerology(linked.user.telegram_user_id, "summary");
      if (!summary.ok) {
        await ctx.reply(summary.message || copy.siteBridgeDown, {
          reply_markup: linkKb(summary.linkUrl),
        });
        return true;
      }
      const focusNumber =
        typeof summary.focusNumber === "number" && Number.isFinite(summary.focusNumber)
          ? summary.focusNumber
          : 0;
      if (!focusNumber) {
        await ctx.reply("Не удалось собрать карточку — откройте схему ещё раз.", {
          reply_markup: salonKeyboard(),
        });
        return true;
      }
      await ctx.replyWithChatAction("upload_photo");
      const buf = await renderMatrixShareCardImage({
        focusLabel: summary.focusLabel || "Узел периода",
        focusTitle: summary.focusTitle || `Аркан ${focusNumber}`,
        focusNumber,
        practice: summary.practiceSeed || summary.shareCard || "",
        name: summary.name,
      });
      await ctx.replyWithPhoto(new InputFile(buf, "matrix-share.jpg"), {
        caption: summary.shareCard || undefined,
        reply_markup: summary.owned
          ? matrixOwnedKeyboard({ siteUrl: summary.url })
          : matrixGetKeyboard({
              cost: summary.cost ?? 20,
              shopUrl: summary.shopUrl,
              runeBalance: summary.runeBalance,
            }),
      });
    } catch (err) {
      console.error("[cabinet] matrix share", err);
      await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
    }
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
        reading: data.reading,
        cardNames: [],
        sessionId,
        matrixActions: true,
        matrixPaging: true,
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
function parseSubjectBirthDateRu(raw: string): string | null {
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/.exec(raw.trim());
  if (!m) return null;
  let dd = Number(m[1]);
  let mm = Number(m[2]);
  let yyyy = Number(m[3]);
  if (yyyy < 100) yyyy += yyyy >= 30 ? 1900 : 2000;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const iso = `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() + 1 !== mm || d.getUTCDate() !== dd) {
    return null;
  }
  const now = new Date();
  let age = now.getUTCFullYear() - yyyy;
  const monthDiff = now.getUTCMonth() + 1 - mm;
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dd)) age -= 1;
  if (age < 0 || age > 120) return null;
  return iso;
}

export async function handleCabinetText(ctx: Context, text: string): Promise<boolean> {
  if (!ctx.from) return false;
  const flow = getFlow(ctx.from.id);
  if (!flow) return false;

  if (flow.flow === "matrix_subject" && flow.step === "dob") {
    const kind = typeof flow.data?.kind === "string" ? flow.data.kind : "";
    if (kind !== "child" && kind !== "partner" && kind !== "other") {
      clearFlow(ctx.from.id);
      return true;
    }
    const iso = parseSubjectBirthDateRu(text);
    if (!iso) {
      await ctx.reply("Некорректная дата. Формат: ДД.ММ.ГГГГ (возраст 0–120 лет).");
      return true;
    }
    setFlow(ctx.from.id, "matrix_subject", "name", { kind, birthDate: iso });
    await ctx.reply("Как подписать человека? (имя или «-», чтобы пропустить)");
    return true;
  }

  if (flow.flow === "matrix_subject" && flow.step === "name") {
    const kind = typeof flow.data?.kind === "string" ? flow.data.kind : "";
    const birthDate = typeof flow.data?.birthDate === "string" ? flow.data.birthDate : "";
    if ((kind !== "child" && kind !== "partner" && kind !== "other") || !birthDate) {
      clearFlow(ctx.from.id);
      return true;
    }
    const displayName =
      text.trim() === "-" || text.trim().toLowerCase() === "пропустить"
        ? undefined
        : text.trim().slice(0, 40) || undefined;
    const linked = await ensureSiteLinked(ctx);
    if (!linked) return true;
    try {
      const { data } = await siteNumerology(
        linked.user.telegram_user_id,
        "subjects.create",
        undefined,
        { kind, birthDate, displayName }
      );
      if (!data.ok || !data.subject?.id) {
        await ctx.reply(data.message || "Не удалось сохранить. Попробуйте ещё раз.", {
          reply_markup: salonKeyboard(),
        });
        clearFlow(linked.user.telegram_user_id);
        return true;
      }
      setFlow(linked.user.telegram_user_id, "matrix_subject", "active", {
        subjectId: data.subject.id,
      });
      const label =
        data.subject.displayName ||
        (data.subject.kind === "child"
          ? "Ребёнок"
          : data.subject.kind === "partner"
            ? "Партнёр"
            : "Другой человек");
      await ctx.reply(`Сохранено: ${label} · ${data.subject.birthDate}`);
      const { data: summary } = await siteNumerology(
        linked.user.telegram_user_id,
        "summary",
        undefined,
        { subjectId: data.subject.id }
      );
      if (summary.ok) {
        await renderMatrixTeaserFromSummary(ctx, summary);
      } else {
        await ctx.reply(summary.message || copy.siteBridgeDown, {
          reply_markup: salonKeyboard(),
        });
      }
    } catch (err) {
      console.error("[cabinet] matrix subject create", err);
      clearFlow(linked.user.telegram_user_id);
      await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
    }
    return true;
  }

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
