/**
 * Idempotent deck asset builder: download public-domain assets first,
 * generate missing via OpenRouter Seedream 4.5, cache forever in public/decks/.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  DECK_SYSTEMS,
  STYLE_BASE,
  deckEntries,
  RUNE_DOWNLOAD,
  TAROT_DOWNLOAD_BASE,
  TAROT_SOURCE_FILES,
  tarotMinorSource,
} from "./deck-assets-data.mjs";
import { MIN_DECK_BACK_BYTES, writeProgrammaticBack } from "./deck-back-art.mjs";
import { normalizeDeckCardFile } from "./deck-card-normalize.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

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
const PUBLIC_TAROT = path.join(ROOT, "public", "tarot");
const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const MODELS_API = "https://openrouter.ai/api/v1/models";
const CONCURRENCY = 2;
const MAX_RETRIES = 3;

const stats = {
  downloaded: 0,
  generated: 0,
  skipped: 0,
  failed: 0,
  bySystem: {},
};

function inc(system, field) {
  stats.bySystem[system] ??= { downloaded: 0, generated: 0, skipped: 0, failed: 0 };
  stats.bySystem[system][field]++;
}

function headers() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  const h = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  h["HTTP-Referer"] = appUrl;
  h["X-Title"] = "Aura Deck Builder";
  return h;
}

async function resolveSeedreamModel() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn("OPENROUTER_API_KEY missing — generation will fail; downloads still run");
    return "bytedance-seed/seedream-4.5";
  }
  const res = await fetch(MODELS_API, { headers: headers() });
  if (!res.ok) throw new Error(`Models API ${res.status}`);
  const data = await res.json();
  const models = data.data ?? data.models ?? [];
  const match = models.find((m) => {
    const name = `${m.id ?? ""} ${m.name ?? ""}`.toLowerCase();
    return /seedream/.test(name) && /4\.5|4-5|45/.test(name);
  }) ?? models.find((m) => {
    const name = `${m.id ?? ""} ${m.name ?? ""}`.toLowerCase();
    return name.includes("seedream");
  });
  if (match?.id) {
    console.log(`Seedream model: ${match.id}`);
    return match.id;
  }
  console.warn("Seedream 4.5 not found in models list, using fallback slug");
  return "bytedance-seed/seedream-4.5";
}

function readManifest(dir) {
  const p = path.join(dir, "manifest.json");
  if (!fs.existsSync(p)) return { version: 1, items: {} };
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeManifest(dir, manifest) {
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

async function optimizePng(filePath) {
  await normalizeDeckCardFile(filePath, { force: true });
}

async function downloadBuffer(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function saveAsPng(buffer, dest) {
  const sharp = (await import("sharp")).default;
  await sharp(buffer).png().toFile(dest);
  await optimizePng(dest);
}

async function tryDownload(urls, dest) {
  for (const url of urls) {
    try {
      const buf = await downloadBuffer(url);
      await saveAsPng(buf, dest);
      return true;
    } catch (e) {
      // try next
    }
  }
  return false;
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

async function generateAndSave(model, prompt, dest) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY not set");
  }
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const buf = await generateImage(model, prompt);
      await saveAsPng(buf, dest);
      return;
    } catch (e) {
      lastErr = e;
      console.warn(`    retry ${attempt}/${MAX_RETRIES}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
}

async function createBack(system, dir, model) {
  const dest = path.join(dir, "_back.png");
  if (fs.existsSync(dest)) return { source: "skipped" };
  const style = STYLE_BASE[system];
  const prompt = `${style}. Ornate card back design only, symmetrical pattern, no text, no watermark, mystical premium deck back`;
  await generateAndSave(model, prompt, dest);
  return { source: "generated" };
}

async function copyLocalTarot(file, dest) {
  const localJpg = path.join(PUBLIC_TAROT, `${file}.jpg`);
  if (fs.existsSync(localJpg)) {
    const sharp = (await import("sharp")).default;
    await sharp(localJpg).png().toFile(dest);
    await optimizePng(dest);
    return true;
  }
  return false;
}

async function downloadTarot(file, dest) {
  if (await copyLocalTarot(file, dest)) return true;
  const src = TAROT_SOURCE_FILES[file] ?? tarotMinorSource(file);
  if (!src) return false;
  const url = TAROT_DOWNLOAD_BASE + encodeURI(src);
  try {
    const buf = await downloadBuffer(url);
    await saveAsPng(buf, dest);
    return true;
  } catch {
    return false;
  }
}

async function downloadRune(file, dest) {
  const urls = RUNE_DOWNLOAD[file] ?? [];
  if (!urls.length) return false;
  try {
    const buf = await downloadBuffer(urls[0]);
    const sharp = (await import("sharp")).default;
    const w = 520;
    const h = 780;
    const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1a1a22"/><stop offset="100%" stop-color="#0a0a10"/>
      </linearGradient></defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <rect x="20" y="30" width="480" height="720" rx="16" fill="#2a2a32" stroke="#8a7355" stroke-width="3"/>
    </svg>`;
    const bg = await sharp(Buffer.from(svg)).png().toBuffer();
    const rune = await sharp(buf).resize(280, 280, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    await sharp(bg)
      .composite([{ input: rune, gravity: "center" }])
      .png()
      .toFile(dest);
    await optimizePng(dest);
    return true;
  } catch {
    return false;
  }
}

async function processEntry(system, entry, dir, manifest, model) {
  const { file, name, hint } = entry;
  const dest = path.join(dir, `${file}.png`);
  const key = file;

  if (fs.existsSync(dest) && manifest.items[key]) {
    inc(system, "skipped");
    stats.skipped++;
    return;
  }

  console.log(`  [${system}] ${file} (${name})`);

  if (system === "tarot-veronika") {
    if (await downloadTarot(file, dest)) {
      manifest.items[key] = { name, file: `${file}.png`, source: "download" };
      inc(system, "downloaded");
      stats.downloaded++;
      return;
    }
  }

  if (system === "runes") {
    if (await downloadRune(file, dest)) {
      manifest.items[key] = { name, file: `${file}.png`, source: "download" };
      inc(system, "downloaded");
      stats.downloaded++;
      return;
    }
  }

  const style = STYLE_BASE[system];
  const prompt = `${style}. Depict "${name}" (${hint}). Single centered symbol/card, no text labels, no watermark, high detail`;
  try {
    await generateAndSave(model, prompt, dest);
    manifest.items[key] = { name, file: `${file}.png`, source: "generated" };
    inc(system, "generated");
    stats.generated++;
  } catch (e) {
    console.error(`    FAILED: ${e.message}`);
    inc(system, "failed");
    stats.failed++;
  }
}

async function runPool(tasks, limit) {
  const queue = [...tasks];
  const workers = Array.from({ length: limit }, async () => {
    while (queue.length) {
      const task = queue.shift();
      if (task) await task();
    }
  });
  await Promise.all(workers);
}

async function buildSystem(system, model) {
  const dir = path.join(ROOT, "public", "decks", system);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = readManifest(dir);
  manifest.items ??= {};

  const entries = deckEntries(system);
  const tasks = entries.map(
    (entry) => () => processEntry(system, entry, dir, manifest, model)
  );

  await runPool(tasks, system.startsWith("tarot-marina") ? 1 : CONCURRENCY);

  const backDest = path.join(dir, "_back.png");
  const backTooSmall = fs.existsSync(backDest) && fs.statSync(backDest).size < MIN_DECK_BACK_BYTES;
  if (!fs.existsSync(backDest) || backTooSmall) {
    if (backTooSmall) {
      console.log(`  [${system}] _back.png too small — regenerating`);
      fs.unlinkSync(backDest);
    } else {
      console.log(`  [${system}] _back.png`);
    }
    try {
      let source = "generated";
      if (process.env.OPENROUTER_API_KEY) {
        try {
          await createBack(system, dir, model);
        } catch (e) {
          console.warn(`    AI back failed (${e.message}), using programmatic fallback`);
          if (system === "tarot-veronika") {
            await writeProgrammaticBack(system, backDest);
            source = "programmatic";
          } else {
            throw e;
          }
        }
      } else if (system === "tarot-veronika") {
        await writeProgrammaticBack(system, backDest);
        source = "programmatic";
      } else {
        throw new Error("OPENROUTER_API_KEY not set and no programmatic back for this system");
      }
      manifest.items._back = { name: "_back", file: "_back.png", source };
      inc(system, source === "programmatic" ? "generated" : "generated");
      stats.generated++;
    } catch (e) {
      console.error(`    back FAILED: ${e.message}`);
    }
  } else {
    inc(system, "skipped");
    stats.skipped++;
  }

  writeManifest(dir, manifest);
}

async function main() {
  console.log("=== Aura deck builder ===\n");
  const model = await resolveSeedreamModel();

  for (const system of DECK_SYSTEMS) {
    console.log(`\n--- ${system} ---`);
    await buildSystem(system, model);
  }

  console.log("\n=== Summary ===");
  console.log(`Downloaded: ${stats.downloaded}`);
  console.log(`Generated:  ${stats.generated}`);
  console.log(`Skipped:    ${stats.skipped}`);
  console.log(`Failed:     ${stats.failed}`);
  for (const [sys, s] of Object.entries(stats.bySystem)) {
    console.log(`  ${sys}: dl=${s.downloaded} gen=${s.generated} skip=${s.skipped} fail=${s.failed}`);
  }

  if (stats.failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
