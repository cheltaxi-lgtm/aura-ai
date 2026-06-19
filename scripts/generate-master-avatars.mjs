#!/usr/bin/env node
/**
 * Generate master portrait avatars via OpenRouter (Seedream 4.5).
 * Unified style — one cohesive gallery; outputs .webp + thumb in public/masters/avatars/
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public", "masters", "avatars");
const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const MODELS_API = "https://openrouter.ai/api/v1/models";
const MAX_RETRIES = 3;

const STYLE_PREFIX = `Premium unified portrait series for mystical app "Aura".
Same cohesive painterly digital art style for every character: cinematic head-and-shoulders portrait,
subject emerging from deep shadow into soft golden rim light, dark cosmic mystical backdrop,
subtle gold gradient frame (#E8C77E to #C9A24A) at edges, atmospheric, photorealistic face detail,
no text, no watermark, no logo, vertical portrait composition.`;

const MASTERS = [
  {
    file: "ragnar",
    id: "ragnar",
    name: "Ragnar",
    prompt: `${STYLE_PREFIX} Character: stern northern Scandinavian man, grey beard, fur cloak, rune stones nearby, aurora borealis glow, cold steel-blue and gold palette, rune master.`,
  },
  {
    file: "veronika",
    id: "veronika",
    name: "Veronika",
    prompt: `${STYLE_PREFIX} Character: refined elegant woman, soft intelligent gaze, holding tarot cards, warm candlelight, wine red and gold palette, psychological tarot reader.`,
  },
  {
    file: "agafya",
    id: "agafya",
    name: "Agafya",
    prompt: `${STYLE_PREFIX} Character: wise Slavic folk healer woman, headscarf, dried herbs, candle glow, earthy warm green and amber palette, gentle mysterious smile.`,
  },
  {
    file: "shri-raj",
    id: "shri-raj",
    name: "Guru Shri Raj",
    prompt: `${STYLE_PREFIX} Character: calm Indian Vedic astrologer man, turban, mandala and star chart motifs in background, deep indigo and gold palette, serene expression.`,
  },
  {
    file: "marina",
    id: "gadalka_marina",
    name: "Marina",
    prompt: `${STYLE_PREFIX} Character: modern elegant young woman tarot reader, stylish dark clothing, moonlit tarot cards, dark golden mystique palette, confident intuitive gaze.`,
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
  if (!key) throw new Error("OPENROUTER_API_KEY is not set — add it to .env.local");
  const h = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  h["HTTP-Referer"] = appUrl;
  h["X-Title"] = "Aura Master Avatars";
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

async function downloadBuffer(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function generateImage(model, prompt) {
  const res = await fetch(OPENROUTER_API, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image"],
      image_config: {
        aspect_ratio: "2:3",
        image_size: "2K",
      },
    }),
    signal: AbortSignal.timeout(120_000),
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

async function savePortraitAndThumb(buffer, baseName) {
  const sharp = (await import("sharp")).default;
  fs.mkdirSync(OUT, { recursive: true });

  const portraitPath = path.join(OUT, `${baseName}.webp`);
  const thumbPath = path.join(OUT, `${baseName}-thumb.webp`);

  await sharp(buffer)
    .resize(400, 520, { fit: "cover", position: "top" })
    .webp({ quality: 88 })
    .toFile(portraitPath);

  await sharp(buffer)
    .resize(120, 120, { fit: "cover", position: "top" })
    .webp({ quality: 85 })
    .toFile(thumbPath);

  return { portraitPath, thumbPath };
}

async function generateMaster(model, master, force) {
  const portraitExists = fs.existsSync(path.join(OUT, `${master.file}.webp`));
  if (portraitExists && !force) {
    console.log(`  skip ${master.name} (already exists, use --force to regenerate)`);
    return "skipped";
  }

  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`  generating ${master.name} (attempt ${attempt})…`);
      const buf = await generateImage(model, master.prompt);
      const { portraitPath, thumbPath } = await savePortraitAndThumb(buf, master.file);
      console.log(`  ✓ ${master.name} → ${path.basename(portraitPath)}, ${path.basename(thumbPath)}`);
      return "generated";
    } catch (e) {
      lastErr = e;
      console.warn(`  retry ${attempt}/${MAX_RETRIES}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2500 * attempt));
    }
  }
  throw lastErr;
}

async function main() {
  const force = process.argv.includes("--force");
  const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];

  console.log("Aura master avatars — OpenRouter generation");
  const model = await resolveSeedreamModel();
  console.log(`Model: ${model}`);

  const list = only ? MASTERS.filter((m) => m.file === only || m.id === only) : MASTERS;
  if (!list.length) {
    console.error(`Unknown master: ${only}`);
    process.exit(1);
  }

  const results = { generated: 0, skipped: 0, failed: 0 };

  for (const master of list) {
    try {
      const status = await generateMaster(model, master, force);
      if (status === "generated") results.generated++;
      else results.skipped++;
    } catch (e) {
      console.error(`  ✗ ${master.name}: ${e.message}`);
      results.failed++;
    }
  }

  console.log("\nDone:", results);
  if (results.failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
