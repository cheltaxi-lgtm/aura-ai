import sharp, { type Sharp } from "sharp";
import { brandHeader, frameDefs, ornateFrame } from "./frame.js";

/**
 * Telegram Desktop sizes photos by the limiting dimension.
 * Tall collages shrink in WIDTH; short text cards stay wide → jagged chat.
 * Every bot image must share this exact canvas so bubbles align.
 */
export const BOT_CANVAS_WIDTH = 1080;
export const BOT_CANVAS_HEIGHT = 1350; // 4:5 — width hits Desktop max first

const BG = { r: 14, g: 12, b: 11, alpha: 1 };

/**
 * Fast Telegram JPEG — mozjpeg is ~2–4× slower for little visual gain in chat.
 */
export const BOT_JPEG = {
  quality: 82,
  mozjpeg: false,
  chromaSubsampling: "4:2:0",
} as const;

export function encodeBotJpeg(pipeline: Sharp): Promise<Buffer> {
  return pipeline.jpeg(BOT_JPEG).toBuffer();
}

/** Pad/scale any image into the shared bot canvas. */
export async function fitToBotCanvas(image: Buffer): Promise<Buffer> {
  return encodeBotJpeg(
    sharp(image).resize(BOT_CANVAS_WIDTH, BOT_CANVAS_HEIGHT, {
      fit: "contain",
      background: BG,
      withoutEnlargement: false,
    })
  );
}

let ornatePlatePromise: Promise<Buffer> | null = null;

/** Cached 1080×1350 plate (gradient + gold frame + brand) — rasterized once. */
export function getOrnatePlate(): Promise<Buffer> {
  if (!ornatePlatePromise) {
    const w = BOT_CANVAS_WIDTH;
    const h = BOT_CANVAS_HEIGHT;
    const svg = Buffer.from(
      `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
        ${frameDefs()}
        ${ornateFrame(w, h)}
        ${brandHeader(w, 68)}
      </svg>`
    );
    ornatePlatePromise = sharp(svg).png().toBuffer().catch((err) => {
      ornatePlatePromise = null;
      throw err;
    });
  }
  return ornatePlatePromise;
}

/** Warm plate + sharp SIMD at process start so the first reading isn't cold. */
export async function warmRenderCaches(): Promise<void> {
  try {
    sharp.concurrency(Math.min(4, Math.max(1, sharp.concurrency())));
    await getOrnatePlate();
  } catch (err) {
    console.warn("[render] warm cache failed", err);
  }
}
