import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { resolveSceneArtDisplayUrl, toStoredSceneArtUrl } from "@/lib/scene-art-url";

const SCENE_ART_DIR = path.join(process.cwd(), "public", "scene-art");
const MAX_SCENE_ART_BYTES = 2 * 1024 * 1024;
const ALLOWED_SCENE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

function extensionForMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

/** Data URLs from OpenRouter are too large for JSONB — save to disk and return a short relative URL. */
export async function normalizeSceneImageUrl(imageUrl: string): Promise<string> {
  const trimmed = imageUrl.trim();
  if (!trimmed.startsWith("data:")) return toStoredSceneArtUrl(trimmed);

  const match = trimmed.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return trimmed;

  const mime = match[1].toLowerCase().split(";")[0]?.trim() || "";
  if (!ALLOWED_SCENE_MIME.has(mime)) {
    throw new Error("unsupported_scene_art_mime");
  }

  // Reject oversized payloads before allocating a huge Buffer.
  const approxBytes = Math.floor((match[2].length * 3) / 4);
  if (approxBytes > MAX_SCENE_ART_BYTES) {
    throw new Error("scene_art_too_large");
  }

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength > MAX_SCENE_ART_BYTES) {
    throw new Error("scene_art_too_large");
  }

  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const ext = extensionForMime(mime);
  const filename = `${hash}-${randomUUID().slice(0, 8)}.${ext}`;

  await mkdir(SCENE_ART_DIR, { recursive: true });
  await writeFile(path.join(SCENE_ART_DIR, filename), buffer);

  return `/api/scene-art/${filename}`;
}

export { toStoredSceneArtUrl, resolveSceneArtDisplayUrl };
