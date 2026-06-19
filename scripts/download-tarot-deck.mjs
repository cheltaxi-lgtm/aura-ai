/**
 * Downloads Rider-Waite-Smith deck (public domain) and optimizes for web.
 * Source: github.com/dejagwentendu/Tarot-Cards-public
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public", "tarot");
const BASE =
  "https://raw.githubusercontent.com/dejagwentendu/Tarot-Cards-public/main/";

const RANKS = [
  "ace",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "page",
  "knight",
  "queen",
  "king",
];

const MAJOR = [
  ["RWS_Tarot_00_Fool.jpg", "the-fool.jpg"],
  ["RWS_Tarot_01_Magician.jpg", "the-magician.jpg"],
  ["RWS_Tarot_02_High_Priestess.jpg", "the-high-priestess.jpg"],
  ["RWS_Tarot_03_Empress.jpg", "the-empress.jpg"],
  ["RWS_Tarot_04_Emperor.jpg", "the-emperor.jpg"],
  ["RWS_Tarot_05_Hierophant.jpg", "the-hierophant.jpg"],
  ["RWS_Tarot_06_Lovers.jpg", "the-lovers.jpg"],
  ["RWS_Tarot_07_Chariot.jpg", "the-chariot.jpg"],
  ["RWS_Tarot_08_Strength.jpg", "strength.jpg"],
  ["RWS_Tarot_09_Hermit.jpg", "the-hermit.jpg"],
  ["RWS_Tarot_10_Wheel_of_Fortune.jpg", "wheel-of-fortune.jpg"],
  ["RWS_Tarot_11_Justice.jpg", "justice.jpg"],
  ["RWS_Tarot_12_Hanged_Man.jpg", "the-hanged-man.jpg"],
  ["RWS_Tarot_13_Death.jpg", "death.jpg"],
  ["RWS_Tarot_14_Temperance.jpg", "temperance.jpg"],
  ["RWS_Tarot_15_Devil.jpg", "the-devil.jpg"],
  ["RWS_Tarot_16_Tower.jpg", "the-tower.jpg"],
  ["RWS_Tarot_17_Star (1).jpg", "the-star.jpg"],
  ["RWS_Tarot_18_Moon.jpg", "the-moon.jpg"],
  ["RWS_Tarot_19_Sun.jpg", "the-sun.jpg"],
  ["RWS_Tarot_20_Judgement.jpg", "judgement.jpg"],
  ["RWS_Tarot_21_World.jpg", "the-world.jpg"],
];

const SUITS = [
  { prefix: "Cups", slug: "cups" },
  { prefix: "Wands", slug: "wands", alt: { 9: "Tarot_Nine_of_Wands.jpg" } },
  { prefix: "Swords", slug: "swords" },
  { prefix: "Pents", slug: "pentacles" },
];

const BACK_SOURCES = [
  "https://upload.wikimedia.org/wikipedia/commons/3/3a/RWS_Tarot_Back.jpg",
  "https://www.sacred-texts.com/tarot/pkt/img/cardback.jpg",
];

function minorFiles() {
  const out = [];
  for (const suit of SUITS) {
    for (let i = 1; i <= 14; i++) {
      const num = String(i).padStart(2, "0");
      const src =
        suit.alt?.[i] ?? `${suit.prefix}${num}.jpg`;
      const dst = `${RANKS[i - 1]}-of-${suit.slug}.jpg`;
      out.push([src, dst]);
    }
  }
  return out;
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function optimizeImage(filePath) {
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(filePath).metadata();
    const maxH = 800;
    if ((meta.height ?? 0) <= maxH && (meta.width ?? 0) <= 600) {
      await sharp(filePath).jpeg({ quality: 82, mozjpeg: true }).toFile(filePath + ".tmp");
    } else {
      await sharp(filePath)
        .resize({ height: maxH, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(filePath + ".tmp");
    }
    fs.renameSync(filePath + ".tmp", filePath);
  } catch (e) {
    console.warn("  optimize skip:", path.basename(filePath), e.message);
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = [...MAJOR, ...minorFiles()];
  let ok = 0;
  let fail = 0;

  for (const [src, dst] of files) {
    const dest = path.join(OUT_DIR, dst);
    const url = BASE + encodeURI(src).replace(/%20/g, "%20");
    try {
      process.stdout.write(`  ${dst} ... `);
      const bytes = await download(url, dest);
      await optimizeImage(dest);
      const finalSize = fs.statSync(dest).size;
      console.log(`${Math.round(finalSize / 1024)}KB`);
      ok++;
    } catch (err) {
      console.log(`FAIL: ${err.message}`);
      fail++;
    }
  }

  let backOk = false;
  for (const backUrl of BACK_SOURCES) {
    try {
      process.stdout.write("  _back.jpg ... ");
      await download(backUrl, path.join(OUT_DIR, "_back.jpg"));
      await optimizeImage(path.join(OUT_DIR, "_back.jpg"));
      console.log("ok");
      backOk = true;
      break;
    } catch {
      console.log(`fail (${backUrl})`);
    }
  }
  if (!backOk) {
    console.warn("  Using the-fool.jpg copy as temporary back");
    fs.copyFileSync(path.join(OUT_DIR, "the-fool.jpg"), path.join(OUT_DIR, "_back.jpg"));
  }

  console.log(`\nDone: ${ok}/${files.length} cards, ${fail} failed, back=${backOk}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
