#!/usr/bin/env node
/**
 * Generate editorial landing card images (topics, practices, hero).
 * Outputs .jpg to public/landing/
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public", "landing");
const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const MODELS_API = "https://openrouter.ai/api/v1/models";
const MAX_RETRIES = 3;

const STYLE = `Premium editorial photo for mystical app Zovus landing page.
Dark warm charcoal atmosphere (#0a0908), soft golden rim light (#c9a24a), cinematic, moody, photorealistic.
Absolutely no text, no letters, no numbers, no hex codes, no watermark, no logo, no UI overlays, no labels.
No faces looking at camera directly. Subtle film grain, shallow depth of field.`;

const CARDS = [
  {
    out: "hero.jpg",
    aspect: "16:9",
    prompt: `${STYLE} Scene: intimate candlelit divination table, tarot cards spread, warm amber glow, smoke wisps, velvet cloth, full-bleed hero banner composition.`,
  },
  {
    out: "topics/relations.jpg",
    aspect: "4:3",
    prompt: `${STYLE} Theme "Отношения": two intertwined golden rings on dark velvet, soft rose petals, warm intimate mood, love and partnership symbolism.`,
  },
  {
    out: "topics/choice.jpg",
    aspect: "4:3",
    prompt: `${STYLE} Theme "Выбор": misty forest crossroads at dusk, two diverging dirt paths, golden lantern glow on the right path, moss and ancient trees, decision symbolism. Clean sky without any writing or symbols.`,
  },
  {
    out: "topics/self-knowledge.jpg",
    aspect: "4:3",
    prompt: `${STYLE} Theme "Самопознание": antique mirror reflecting stars and moon on dark wall, solitary introspection, inner journey symbolism.`,
  },
  {
    out: "topics/work.jpg",
    aspect: "4:3",
    prompt: `${STYLE} Theme "Работа": golden coins and compass on dark wooden desk, career ambition, structured professional energy.`,
  },
  {
    out: "practices/classic-tarot.jpg",
    aspect: "4:3",
    prompt: `${STYLE} Theme "Классическое Таро": rider-waite style tarot cards fanned on mystical table, candles, classic tarot reading setup.`,
  },
  {
    out: "practices/photo-tarot.jpg",
    aspect: "4:3",
    prompt: `${STYLE} Theme "ФотоТаро": smartphone photographing tarot cards on table, screen glow mixing with candlelight, modern digital mysticism.`,
  },
  {
    out: "practices/numerology.jpg",
    aspect: "4:3",
    prompt: `${STYLE} Theme "Нумерология": glowing sacred geometry and numbers 1-9 floating over dark indigo background, golden numerology symbols.`,
  },
  {
    out: "practices/natal-chart.jpg",
    aspect: "4:3",
    prompt: `${STYLE} Theme "Натальная карта": antique brass astrolabe and zodiac wheel on dark velvet, candlelight, golden star chart engraving, celestial mysticism.`,
  },
];

function loadEnvFile(name) {
  const p = path.join(ROOT, name);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1]] = val;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

function headers() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  const h = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  h["HTTP-Referer"] = appUrl;
  h["X-Title"] = "Zovus Landing Cards";
  return h;
}

async function resolveSeedreamModel() {
  const env = process.env.OPENROUTER_IMAGE_MODEL?.trim();
  if (env) return env;
  const res = await fetch(MODELS_API, { headers: headers() });
  if (!res.ok) return "bytedance-seed/seedream-4.5";
  const data = await res.json();
  const models = data.data ?? data.models ?? [];
  const match =
    models.find((m) => {
      const name = `${m.id ?? ""} ${m.name ?? ""}`.toLowerCase();
      return /seedream/.test(name) && /4\.5|4-5|45/.test(name);
    }) ?? models.find((m) => `${m.id ?? ""}`.toLowerCase().includes("seedream"));
  return match?.id ?? "bytedance-seed/seedream-4.5";
}

function extractImageUrl(message) {
  if (!message) return null;
  const images = message.images;
  if (Array.isArray(images) && images.length) {
    return images[0]?.image_url?.url ?? images[0]?.imageUrl?.url ?? null;
  }
  const parts = message.content;
  if (Array.isArray(parts)) {
    for (const p of parts) {
      if (p.type === "image_url" && p.image_url?.url) return p.image_url.url;
    }
  }
  return null;
}

const IMAGE_HOST_ALLOWLIST = new Set([
  "openrouter.ai",
  "oaidalleapiprodscus.blob.core.windows.net",
  "filesystem.site",
  "delivered-by-ssdndata.com",
  "lh3.googleusercontent.com",
  "storage.googleapis.com",
  "cdn.openai.com",
]);

function assertAllowedImageUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`Invalid image URL: ${urlString}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`Refusing non-HTTPS image URL: ${parsed.protocol}`);
  }
  const host = parsed.hostname.toLowerCase();
  const allowed =
    IMAGE_HOST_ALLOWLIST.has(host) ||
    host.endsWith(".blob.core.windows.net") ||
    host.endsWith(".openrouter.ai");
  if (!allowed) {
    throw new Error(`Image host not allowlisted: ${host}`);
  }
  return parsed.toString();
}

async function downloadBuffer(url) {
  const safeUrl = assertAllowedImageUrl(url);
  const res = await fetch(safeUrl, { redirect: "error" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function generateImage(model, prompt, aspect) {
  const res = await fetch(OPENROUTER_API, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image"],
      image_config: {
        aspect_ratio: aspect,
        image_size: "2K",
      },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error?.message ?? `HTTP ${res.status}`);
  const url = extractImageUrl(payload.choices?.[0]?.message);
  if (!url) throw new Error("No image in response");
  if (url.startsWith("data:")) {
    const b64 = url.split(",")[1];
    return Buffer.from(b64, "base64");
  }
  return downloadBuffer(url);
}

async function saveJpeg(buffer, relPath, width, height) {
  const sharp = (await import("sharp")).default;
  const full = path.join(OUT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  await sharp(buffer)
    .resize(width, height, { fit: "cover", position: "centre" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(full);
  return full;
}

async function generateCard(model, card, force) {
  const full = path.join(OUT, card.out);
  if (fs.existsSync(full) && !force) {
    console.log(`  skip ${card.out} (exists, use --force)`);
    return "skipped";
  }
  const [w, h] = card.aspect === "16:9" ? [1920, 1080] : [1200, 900];
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`  generating ${card.out} (attempt ${attempt})…`);
      const buf = await generateImage(model, card.prompt, card.aspect);
      await saveJpeg(buf, card.out, w, h);
      console.log(`  ✓ ${card.out}`);
      return "generated";
    } catch (e) {
      lastErr = e;
      console.warn(`  retry ${attempt}/${MAX_RETRIES}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  throw lastErr;
}

async function main() {
  const force = process.argv.includes("--force");
  const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
  const model = await resolveSeedreamModel();
  console.log(`Model: ${model}`);
  const list = only ? CARDS.filter((c) => c.out.includes(only)) : CARDS;
  if (!list.length) throw new Error(`No cards match --only=${only}`);
  let generated = 0;
  let skipped = 0;
  for (const card of list) {
    const result = await generateCard(model, card, force);
    if (result === "generated") generated++;
    else skipped++;
  }
  console.log(`Done: ${generated} generated, ${skipped} skipped`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
