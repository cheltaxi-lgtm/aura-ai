import { randomUUID } from "node:crypto";
import https from "node:https";
import { URL } from "node:url";
import sharp from "sharp";
import type { Context } from "grammy";
import { InlineKeyboard, InputFile } from "grammy";
import { botConfig } from "../config.js";
import { copy } from "../copy/ru.js";
import { clearFlow, getFlow, setFlow } from "../db/repos.js";
import {
  buildSessionChatUrl,
  chunkTelegramText,
  sitePhoto,
  type SitePhotoRedrawSpread,
} from "../domain/site-client.js";
import {
  drawnCardsFromSiteCards,
  presentReadingToTelegram,
} from "../domain/reading/present.js";
import { renderSpreadCollage } from "../render/card-collage.js";
import { renderHistoryEntryImage } from "../render/history-entry.js";
import { renderPhotoHomeCardImage } from "../render/photo-home-card.js";
import {
  CB,
  webAppButton,
  continueOnSiteKeyboard,
  linkAccountKeyboard,
  photoPagerKeyboard,
  salonKeyboard,
} from "../keyboards/index.js";
import { announceWorking } from "./helpers.js";
import { ensureSiteLinked } from "./site-account.js";

let photoCopyCounter = 0;

const MAX_PHOTO_BYTES = 4.5 * 1024 * 1024;

type PhotoHistoryItem = {
  id: string;
  master: string;
  date: string;
  question: string;
  preview: string;
  cards: string[];
  sessionId: string | null;
};

type PhotoHomeMeta = {
  cost: number;
  firstDiscount: boolean;
  balance: number | null;
  url: string | null;
};

function isNotModifiedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /message is not modified/i.test(msg);
}

/** IPv4-only HTTPS GET — avoids ETIMEDOUT when VPS IPv6 to api.telegram.org is broken. */
function httpsGetBuffer(url: string, timeoutMs = 60_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.get(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        family: 4,
        timeout: timeoutMs,
        headers: { "User-Agent": "zovus-telegram-bot/photo" },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          httpsGetBuffer(res.headers.location, timeoutMs).then(resolve, reject);
          return;
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(new Error(`telegram_download_http_${res.statusCode ?? 0}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("telegram_download_timeout"));
    });
    req.on("error", reject);
  });
}

function linkKb(url?: string | null) {
  return url ? linkAccountKeyboard(url) : salonKeyboard();
}

function photoHomeKeyboard(opts: {
  cost: number;
  firstDiscount?: boolean;
  url?: string | null;
}): InlineKeyboard {
  const kb = new InlineKeyboard().text(`📷 Новый расклад · ${opts.cost}ᚢ`, CB.phNew);
  if (opts.firstDiscount) {
    kb.row().text("✦ Первая скидка 50%", CB.phNoop);
  }
  if (opts.url) {
    webAppButton(kb.row(), "🕯 На сайте", opts.url);
  }
  return kb;
}

function photoConfirmKeyboard(opts?: { siteUrl?: string | null; cost?: number }): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text(
      opts?.cost != null ? `✨ Расшифровать · ${opts.cost}ᚢ` : "✨ Расшифровать",
      CB.phOk
    )
    .text("↩ Отмена", CB.phCancel);
  if (opts?.siteUrl) {
    webAppButton(kb.row(), "🕯 Поправить на сайте", opts.siteUrl);
  }
  return kb;
}

function photoAwaitKeyboard(siteUrl?: string | null): InlineKeyboard {
  const kb = new InlineKeyboard().text("↩ Отмена", CB.phCancel);
  if (siteUrl) webAppButton(kb.row(), "🕯 На сайте", siteUrl);
  return kb;
}

async function downloadTelegramFile(ctx: Context, fileId: string): Promise<Buffer> {
  const file = await ctx.api.getFile(fileId);
  const path = file.file_path;
  if (!path) {
    throw new Error("telegram_get_file_failed: empty file_path");
  }
  const url = `https://api.telegram.org/file/bot${botConfig.token}/${path}`;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const buf = await httpsGetBuffer(url);
      if (!buf.length) throw new Error("telegram_download_empty");
      return buf;
    } catch (err) {
      lastErr = err;
      console.warn(`[photo] download attempt ${attempt}/3 failed`, err);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("telegram_download_failed");
}

async function compressPhotoForSite(buf: Buffer): Promise<{ base64: string; mimeType: string }> {
  let pipeline = sharp(buf, { failOn: "none" }).rotate().resize({
    width: 1600,
    height: 1600,
    fit: "inside",
    withoutEnlargement: true,
  });
  let out = await pipeline.jpeg({ quality: 82, mozjpeg: false }).toBuffer();
  if (out.length > MAX_PHOTO_BYTES) {
    out = await sharp(out).jpeg({ quality: 68, mozjpeg: false }).toBuffer();
  }
  if (out.length > MAX_PHOTO_BYTES) {
    out = await sharp(out)
      .resize({ width: 1200, height: 1200, fit: "inside" })
      .jpeg({ quality: 55, mozjpeg: false })
      .toBuffer();
  }
  if (out.length > MAX_PHOTO_BYTES) {
    throw new Error("photo_too_large");
  }
  return { base64: out.toString("base64"), mimeType: "image/jpeg" };
}

function confidenceRu(raw?: string): string | null {
  switch ((raw || "").toLowerCase()) {
    case "high":
      return "высокая";
    case "medium":
      return "средняя";
    case "low":
      return "низкая";
    default:
      return null;
  }
}

function previewCardLines(
  redrawSpread?: SitePhotoRedrawSpread,
  detectedCards?: string[]
): string[] {
  if (redrawSpread?.cards?.length) {
    return redrawSpread.cards.map((c, i) => {
      const name = (c.name || c.originalName || detectedCards?.[i] || "—").trim();
      const reversed = c.reversed || /\(перев/i.test(name);
      const clean = name.replace(/\s*\(перев[^)]*\)\s*/i, "").trim();
      return reversed ? `${clean} (перев.)` : clean;
    });
  }
  return (detectedCards || []).map((c) => c.trim()).filter(Boolean);
}

function formatRecognizePreview(data: {
  detectedCards?: string[];
  redrawSpread?: SitePhotoRedrawSpread;
  deckType?: string;
  spreadType?: string;
  confidence?: string;
  partial?: boolean;
  message?: string;
  question?: string;
}): string {
  const cards = previewCardLines(data.redrawSpread, data.detectedCards);
  const conf = confidenceRu(data.confidence);
  const lines = [
    copy.photoRecognizedTitle,
    data.deckType ? `Колода: ${data.deckType}` : "",
    data.spreadType ? `Схема: ${data.spreadType}` : "",
    conf ? `Уверенность: ${conf}` : "",
    data.question ? `Вопрос: ${data.question}` : "",
    "",
    cards.length
      ? cards.map((c, i) => `${i + 1}. ${c}`).join("\n")
      : "Карты не распознаны.",
  ];
  if (data.partial && data.message) {
    lines.push("", data.message);
  }
  lines.push("", copy.photoConfirmHint);
  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
}

async function renderPhotoAlbumPage(
  ctx: Context,
  item: PhotoHistoryItem,
  page: number,
  total: number
): Promise<void> {
  const markup = photoPagerKeyboard({
    page,
    total,
    historyId: item.id,
  });
  await ctx.replyWithChatAction("upload_photo").catch(() => undefined);
  const buf = await renderHistoryEntryImage({
    kind: "photo",
    topic: item.question || item.master || "Расклад по фото",
    date: item.date,
    preview: item.preview,
    cards: item.cards,
    page,
    total,
  });
  const file = new InputFile(buf, `photo-history-${page + 1}.jpg`);
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
      console.warn("[photo] edit media failed, falling back to reply", err);
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

export async function showPhoto(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  await announceWorking(
    ctx,
    copy.cabinetPreparing(linked.user.telegram_user_id, photoCopyCounter++)
  );
  try {
    const { data } = await sitePhoto(linked.user.telegram_user_id, "list", { limit: 30 });
    if (!data.ok) {
      await ctx.reply(data.message || copy.siteBridgeDown, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }
    const cost = data.effectiveCost ?? data.cost ?? 30;
    const items: PhotoHistoryItem[] = (data.items ?? []).map((i) => ({
      id: i.id,
      master: i.master || "мастер",
      date: i.date || "",
      question: i.question || "",
      preview: i.preview || "",
      cards: i.cards ?? [],
      sessionId: i.sessionId ?? null,
    }));
    const meta: PhotoHomeMeta = {
      cost,
      firstDiscount: data.firstPhotoDiscount === true,
      balance: typeof data.runeBalance === "number" ? data.runeBalance : null,
      url: data.url ?? null,
    };

    await ctx.replyWithChatAction("upload_photo").catch(() => undefined);

    // History first (if any), then the new-spread card.
    if (items.length) {
      setFlow(linked.user.telegram_user_id, "photo_history", "page", {
        items,
        page: 0,
        meta,
      } as unknown as Record<string, unknown>);
      await renderPhotoAlbumPage(ctx, items[0]!, 0, items.length);
    } else {
      clearFlow(linked.user.telegram_user_id);
    }

    const homeBuf = await renderPhotoHomeCardImage({
      cost,
      balance: meta.balance,
      firstDiscount: meta.firstDiscount,
      historyCount: items.length,
      mode: "home",
    });
    await ctx.replyWithPhoto(new InputFile(homeBuf, "photo-home.jpg"), {
      reply_markup: photoHomeKeyboard({
        cost,
        firstDiscount: meta.firstDiscount,
        url: meta.url,
      }),
    });
  } catch (err) {
    console.error("[photo] list", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

export async function beginPhotoReading(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  let siteUrl: string | null = null;
  let cost = 30;
  let balance: number | null = null;
  let firstDiscount = false;
  try {
    const { data } = await sitePhoto(linked.user.telegram_user_id, "pricing");
    if (data.ok) {
      siteUrl = data.url ?? null;
      cost = data.effectiveCost ?? data.cost ?? cost;
      balance = typeof data.runeBalance === "number" ? data.runeBalance : null;
      firstDiscount = data.firstPhotoDiscount === true;
    }
  } catch {
    /* ignore */
  }
  setFlow(linked.user.telegram_user_id, "photo", "await_photo", {
    characterId: "veronika",
    cost,
    siteUrl,
  });

  try {
    await ctx.replyWithChatAction("upload_photo").catch(() => undefined);
    const buf = await renderPhotoHomeCardImage({
      cost,
      balance,
      firstDiscount,
      mode: "await",
    });
    await ctx.replyWithPhoto(new InputFile(buf, "photo-await.jpg"), {
      reply_markup: photoAwaitKeyboard(siteUrl),
    });
  } catch (err) {
    console.error("[photo] await card", err);
    await ctx.reply(copy.photoAskPhoto(cost), {
      reply_markup: photoAwaitKeyboard(siteUrl),
    });
  }
}

async function openPhotoReading(ctx: Context, historyId: string): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  try {
    await ctx.replyWithChatAction("typing");
    const { data } = await sitePhoto(linked.user.telegram_user_id, "get", { historyId });
    if (!data.ok || !data.analysis) {
      await ctx.reply(data.message || copy.photoNotFound, {
        reply_markup: linkKb(data.linkUrl),
      });
      return;
    }
    await presentReadingToTelegram(ctx, {
      reading: data.analysis,
      cardNames: data.cards,
      question: data.question,
      sessionId: data.sessionId || undefined,
      footer: data.master ? `Мастер: ${data.master}` : undefined,
    });
  } catch (err) {
    console.error("[photo] get", err);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

async function runRecognizeFromBuffer(
  ctx: Context,
  buf: Buffer,
  question: string
): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  const flow = getFlow(linked.user.telegram_user_id);
  const characterId =
    typeof flow?.data.characterId === "string" ? flow.data.characterId : "veronika";
  const cost = typeof flow?.data.cost === "number" ? flow.data.cost : 30;

  await ctx.reply(copy.photoRecognizing);
  await ctx.replyWithChatAction("typing");

  let packed: { base64: string; mimeType: string };
  try {
    packed = await compressPhotoForSite(buf);
  } catch (err) {
    console.error("[photo] compress", err);
    await ctx.reply(copy.photoTooLarge, { reply_markup: salonKeyboard() });
    clearFlow(linked.user.telegram_user_id);
    return;
  }

  try {
    const { data } = await sitePhoto(linked.user.telegram_user_id, "recognize", {
      imageBase64: packed.base64,
      mimeType: packed.mimeType,
      characterId,
      question,
    });

    if (!data.ok || !data.redrawSpread?.cards?.length) {
      clearFlow(linked.user.telegram_user_id);
      const kb =
        data.url || data.linkUrl
          ? continueOnSiteKeyboard(data.url || data.linkUrl!)
          : salonKeyboard();
      await ctx.reply(data.message || copy.photoNotSpread, { reply_markup: kb });
      return;
    }

    setFlow(linked.user.telegram_user_id, "photo", "confirm", {
      characterId: data.characterId || characterId,
      question: data.question || question,
      redrawSpread: data.redrawSpread,
      detectedCards: data.detectedCards || [],
      cost,
      siteUrl: data.url || null,
    });

    const confirmKb = photoConfirmKeyboard({
      siteUrl: data.url,
      cost,
    });
    let sentCollage = false;
    try {
      const drawn = drawnCardsFromSiteCards(
        data.redrawSpread.cards.map((c) => ({
          name: c.name || c.originalName || "",
          reversed: c.reversed,
          positionLabel: c.position,
        }))
      );
      if (drawn.length) {
        await ctx.replyWithChatAction("upload_photo").catch(() => undefined);
        const collage = await renderSpreadCollage(drawn, {
          revealedCount: drawn.length,
          question: data.question || question || undefined,
        });
        await ctx.replyWithPhoto(new InputFile(collage, "photo-confirm.jpg"), {
          reply_markup: confirmKb,
        });
        sentCollage = true;
      }
    } catch (err) {
      console.error("[photo] confirm collage", err);
    }

    const preview = formatRecognizePreview({
      detectedCards: data.detectedCards,
      redrawSpread: data.redrawSpread,
      deckType: data.deckType,
      spreadType: data.spreadType,
      confidence: data.confidence,
      partial: data.partial,
      message: data.message,
      question: data.question || question,
    });
    const chunks = chunkTelegramText(preview);
    for (let i = 0; i < chunks.length; i++) {
      const last = i === chunks.length - 1;
      await ctx.reply(
        chunks[i]!,
        !sentCollage && last ? { reply_markup: confirmKb } : undefined
      );
    }
    if (sentCollage) {
      await ctx.reply(copy.photoConfirmPrompt);
    }
  } catch (err) {
    console.error("[photo] recognize", err);
    clearFlow(linked.user.telegram_user_id);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
}

async function runInterpret(ctx: Context): Promise<void> {
  const linked = await ensureSiteLinked(ctx);
  if (!linked) return;
  const flow = getFlow(linked.user.telegram_user_id);
  if (!flow || flow.flow !== "photo" || flow.step !== "confirm") {
    await ctx.reply(copy.photoStartOver, { reply_markup: salonKeyboard() });
    return;
  }

  const redrawSpread = flow.data.redrawSpread as SitePhotoRedrawSpread | undefined;
  if (!redrawSpread?.cards?.length) {
    clearFlow(linked.user.telegram_user_id);
    await ctx.reply(copy.photoStartOver, { reply_markup: salonKeyboard() });
    return;
  }

  const characterId =
    typeof flow.data.characterId === "string" ? flow.data.characterId : "veronika";
  const question = typeof flow.data.question === "string" ? flow.data.question : "";
  const cost = typeof flow.data.cost === "number" ? flow.data.cost : 30;

  await ctx.reply(copy.photoInterpreting(cost));
  await ctx.replyWithChatAction("typing");

  try {
    const { data } = await sitePhoto(linked.user.telegram_user_id, "interpret", {
      characterId,
      question,
      confirmedSpread: redrawSpread,
      idempotencyKey: randomUUID(),
    });
    clearFlow(linked.user.telegram_user_id);

    if (!data.ok || !data.analysis) {
      if (data.error === "insufficient_runes") {
        await ctx.reply(
          copy.photoInsufficient(data.cost ?? cost, data.runeBalance ?? 0),
          {
            reply_markup: data.linkUrl
              ? continueOnSiteKeyboard(data.linkUrl, "Пополнить руны")
              : salonKeyboard(),
          }
        );
        return;
      }
      await ctx.reply(data.message || copy.photoInterpretFail, {
        reply_markup: linkKb(data.linkUrl || data.url),
      });
      return;
    }

    const footerParts = [
      data.charged && data.charged > 0 ? `Списано ${data.charged}ᚢ` : null,
      data.cached ? "Из сохранённых" : null,
      data.firstPhotoDiscount ? "Скидка на первый фото-расклад" : null,
      typeof data.runeBalance === "number" ? `Баланс: ${data.runeBalance}ᚢ` : null,
    ].filter(Boolean);

    await presentReadingToTelegram(ctx, {
      reading: data.analysis,
      cardNames: data.cards,
      question,
      sessionId: data.sessionId || undefined,
      footer: footerParts.join(" · ") || undefined,
    });

    if (data.sessionId) {
      await ctx.reply(copy.photoSavedHint, {
        reply_markup: webAppButton(
          new InlineKeyboard(),
          "🕯 Продолжить на сайте",
          buildSessionChatUrl(data.sessionId)
        ),
      });
    }
  } catch (err) {
    console.error("[photo] interpret", err);
    clearFlow(linked.user.telegram_user_id);
    await ctx.reply(copy.photoInterpretFail, { reply_markup: salonKeyboard() });
  }
}

/** Photo / image document while in photo flow. */
export async function handlePhotoMessage(ctx: Context): Promise<boolean> {
  if (!ctx.from) return false;
  const flow = getFlow(ctx.from.id);
  const inPhotoFlow = flow?.flow === "photo" && flow.step === "await_photo";
  if (!inPhotoFlow) return false;

  const photos = ctx.message?.photo;
  const doc = ctx.message?.document;
  let fileId: string | undefined;
  if (photos?.length) {
    fileId = photos[photos.length - 1]?.file_id;
  } else if (doc?.mime_type?.startsWith("image/") && doc.file_id) {
    fileId = doc.file_id;
  }
  if (!fileId) return false;

  const caption = (ctx.message?.caption || "").trim();
  const questionFromFlow =
    typeof flow.data.question === "string" ? flow.data.question : "";
  const question = caption || questionFromFlow;

  let buf: Buffer;
  try {
    buf = await downloadTelegramFile(ctx, fileId);
  } catch (err) {
    console.error("[photo] download", err);
    await ctx.reply(copy.photoDownloadFail, {
      reply_markup: photoAwaitKeyboard(
        typeof flow.data.siteUrl === "string" ? flow.data.siteUrl : null
      ),
    });
    return true;
  }

  try {
    await runRecognizeFromBuffer(ctx, buf, question);
  } catch (err) {
    console.error("[photo] recognize-pipeline", err);
    clearFlow(ctx.from.id);
    await ctx.reply(copy.siteBridgeDown, { reply_markup: salonKeyboard() });
  }
  return true;
}

/** Optional question text before photo. */
export async function handlePhotoText(ctx: Context, text: string): Promise<boolean> {
  if (!ctx.from) return false;
  const flow = getFlow(ctx.from.id);
  if (!flow || flow.flow !== "photo") return false;

  if (flow.step === "await_photo") {
    setFlow(ctx.from.id, "photo", "await_photo", {
      ...flow.data,
      question: text.slice(0, 500),
    });
    await ctx.reply(copy.photoQuestionSaved, {
      reply_markup: photoAwaitKeyboard(
        typeof flow.data.siteUrl === "string" ? flow.data.siteUrl : null
      ),
    });
    return true;
  }

  return false;
}

export async function handlePhotoCallback(ctx: Context, data: string): Promise<boolean> {
  if (!data.startsWith(CB.phPrefix)) return false;
  const tid = ctx.from?.id;
  if (!tid) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    return true;
  }

  if (data === CB.phNoop) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    return true;
  }

  if (data === CB.phNew) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    await beginPhotoReading(ctx);
    return true;
  }

  if (data === CB.phCancel) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    clearFlow(tid);
    await ctx.reply(copy.photoCancelled, { reply_markup: salonKeyboard() });
    return true;
  }

  if (data === CB.phOk) {
    await ctx.answerCallbackQuery({ text: "Расшифровываю…" }).catch(() => undefined);
    await runInterpret(ctx);
    return true;
  }

  if (data.startsWith(CB.phOpenPrefix)) {
    await ctx.answerCallbackQuery().catch(() => undefined);
    const historyId = data.slice(CB.phOpenPrefix.length);
    if (historyId) await openPhotoReading(ctx, historyId);
    return true;
  }

  if (data.startsWith(CB.phPagePrefix)) {
    const page = Number(data.slice(CB.phPagePrefix.length));
    try {
      const linked = await ensureSiteLinked(ctx);
      if (!linked) return true;
      const { data: list } = await sitePhoto(linked.user.telegram_user_id, "list", {
        limit: 30,
      });
      if (!list.ok || !list.items?.length) {
        clearFlow(tid);
        await ctx.answerCallbackQuery({ text: "Архив пуст" }).catch(() => undefined);
        await showPhoto(ctx);
        return true;
      }
      const items: PhotoHistoryItem[] = list.items.map((i) => ({
        id: i.id,
        master: i.master || "мастер",
        date: i.date || "",
        question: i.question || "",
        preview: i.preview || "",
        cards: i.cards ?? [],
        sessionId: i.sessionId ?? null,
      }));
      const cost = list.effectiveCost ?? list.cost ?? 30;
      const meta: PhotoHomeMeta = {
        cost,
        firstDiscount: list.firstPhotoDiscount === true,
        balance: typeof list.runeBalance === "number" ? list.runeBalance : null,
        url: list.url ?? null,
      };
      const nextPage = Math.min(
        Math.max(0, Number.isFinite(page) ? page : 0),
        items.length - 1
      );
      setFlow(tid, "photo_history", "page", {
        items,
        page: nextPage,
        meta,
      } as unknown as Record<string, unknown>);
      await renderPhotoAlbumPage(ctx, items[nextPage]!, nextPage, items.length);
      await ctx
        .answerCallbackQuery({ text: `${nextPage + 1} / ${items.length}` })
        .catch(() => undefined);
    } catch (err) {
      console.error("[photo] page edit failed", err);
      await ctx.answerCallbackQuery({ text: "Не удалось перелистнуть" }).catch(() => undefined);
    }
    return true;
  }

  await ctx.answerCallbackQuery().catch(() => undefined);
  return true;
}
