import { InputFile } from "grammy";
import type { Context } from "grammy";
import { botConfig } from "../config.js";
import { trackEvent } from "../db/repos.js";
import type { DrawnCard } from "../domain/deck/types.js";
import { isRitualRevealEnabled } from "../flags.js";
import {
  renderTripletCollage,
  writeCachedCollage,
} from "../render/card-collage.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randBetween(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function captionFor(cards: DrawnCard[], revealed: number): string {
  if (revealed <= 0) return "Карты закрыты.";
  const lines = cards.slice(0, revealed).map((c) => {
    const rev = c.reversed ? ", перевёрнута" : "";
    return `${c.positionLabel}: ${c.name}${rev}`;
  });
  return lines.join("\n");
}

/** Progressive reveal via editMessageMedia; degrades to final collage on failure. */
export async function ritualReveal(
  ctx: Context,
  cards: DrawnCard[],
  sessionId: string,
  telegramUserId: number
): Promise<void> {
  const enabled = isRitualRevealEnabled();
  const stages = enabled ? [0, 1, 2, 3] : [3];

  const buffers: Buffer[] = [];
  for (const stage of stages) {
    const buf = await renderTripletCollage(cards, { revealedCount: stage });
    writeCachedCollage(sessionId, stage, buf);
    buffers.push(buf);
  }

  if (!enabled) {
    await ctx.replyWithPhoto(new InputFile(buffers[0]!, "triplet.jpg"), {
      caption: captionFor(cards, 3),
    });
    trackEvent("ritual_completed", telegramUserId, { mode: "instant", session_id: sessionId });
    return;
  }

  await sleep(randBetween(botConfig.ritual.pauseMsMin, botConfig.ritual.pauseMsMax));

  const sent = await ctx.replyWithPhoto(new InputFile(buffers[0]!, "triplet.jpg"), {
    caption: captionFor(cards, 0),
  });

  try {
    for (let i = 1; i < buffers.length; i++) {
      await sleep(randBetween(botConfig.ritual.revealGapMsMin, botConfig.ritual.revealGapMsMax));
      await ctx.api.editMessageMedia(
        ctx.chat!.id,
        sent.message_id,
        {
          type: "photo",
          media: new InputFile(buffers[i]!, `triplet-${i}.jpg`),
          caption: captionFor(cards, i),
        }
      );
    }
    trackEvent("ritual_completed", telegramUserId, { mode: "ritual", session_id: sessionId });
  } catch (err) {
    console.error("[ritual] editMessageMedia failed, degrading", err);
    trackEvent("ritual_completed", telegramUserId, {
      mode: "degraded",
      session_id: sessionId,
      error: "edit_failed",
    });
    try {
      await ctx.api.editMessageMedia(ctx.chat!.id, sent.message_id, {
        type: "photo",
        media: new InputFile(buffers[buffers.length - 1]!, "triplet-final.jpg"),
        caption: captionFor(cards, 3),
      });
    } catch {
      await ctx.replyWithPhoto(new InputFile(buffers[buffers.length - 1]!, "triplet.jpg"), {
        caption: captionFor(cards, 3),
      });
    }
  }
}
