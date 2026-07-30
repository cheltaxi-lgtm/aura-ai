import { InputFile } from "grammy";
import type { Api, Context, NextFunction } from "grammy";
import { renderBotMessageImage } from "../render/bot-message.js";

type AnyOther = Record<string, unknown> | undefined;

function withoutParseMode(other: AnyOther): AnyOther {
  if (!other) return undefined;
  const { parse_mode: _p, ...rest } = other;
  return rest;
}

/**
 * Send plain/HTML text as a 1080px photo — Telegram then uses media width everywhere.
 */
export async function replyFixedWidth(
  ctx: Context,
  text: string,
  other?: Parameters<Context["reply"]>[1]
) {
  const buf = await renderBotMessageImage(String(text ?? ""));
  return ctx.replyWithPhoto(
    new InputFile(buf, "zovus-msg.jpg"),
    withoutParseMode(other as AnyOther) as Parameters<Context["replyWithPhoto"]>[1]
  );
}

export async function apiSendFixedWidth(
  api: Api,
  chatId: number,
  text: string,
  other?: Parameters<Api["sendPhoto"]>[2]
) {
  const buf = await renderBotMessageImage(String(text ?? ""));
  return api.sendPhoto(
    chatId,
    new InputFile(buf, "zovus-msg.jpg"),
    withoutParseMode(other as AnyOther) as Parameters<Api["sendPhoto"]>[2]
  );
}

/**
 * Patch ctx.reply / editMessageText → 1080px photos.
 * Photo captions are stripped (they render as a second narrow text strip on Desktop).
 */
export function fixedWidthMessages() {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const nativeReply = ctx.reply.bind(ctx);
    const nativeEditText = ctx.editMessageText.bind(ctx);
    const nativePhoto = ctx.replyWithPhoto.bind(ctx);

    ctx.reply = (async (text: string, other?: Parameters<Context["reply"]>[1]) => {
      try {
        return await replyFixedWidth(ctx, String(text ?? ""), other);
      } catch (err) {
        console.error("[fixed-width] reply fallback to text", err);
        return nativeReply(text, other);
      }
    }) as Context["reply"];

    ctx.replyWithPhoto = (async (photo, other) => {
      // Captions under photos = uneven width vs the image. Never send them.
      const cleaned = withoutParseMode(other as AnyOther) as
        | Parameters<Context["replyWithPhoto"]>[1]
        | undefined;
      if (cleaned && "caption" in cleaned) {
        const { caption: _c, ...rest } = cleaned as Record<string, unknown>;
        return nativePhoto(photo, rest as Parameters<Context["replyWithPhoto"]>[1]);
      }
      return nativePhoto(photo, cleaned);
    }) as Context["replyWithPhoto"];

    ctx.editMessageText = (async (
      text: string,
      other?: Parameters<Context["editMessageText"]>[1]
    ) => {
      try {
        const buf = await renderBotMessageImage(String(text ?? ""));
        return await ctx.editMessageMedia(
          {
            type: "photo",
            media: new InputFile(buf, "zovus-msg.jpg"),
          },
          withoutParseMode(other as AnyOther) as Parameters<Context["editMessageMedia"]>[1]
        );
      } catch {
        try {
          await ctx.deleteMessage().catch(() => undefined);
          return await replyFixedWidth(
            ctx,
            String(text ?? ""),
            other as Parameters<Context["reply"]>[1]
          );
        } catch (err) {
          console.error("[fixed-width] edit fallback to text", err);
          return nativeEditText(text, other);
        }
      }
    }) as Context["editMessageText"];

    await next();
  };
}
