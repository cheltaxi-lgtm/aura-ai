import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const out = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "tarot",
  "_back.jpg"
);

const w = 400;
const h = 640;
const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#1a1428"/><stop offset="100%" stop-color="#0a0814"/>
  </linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="18" y="28" width="364" height="584" rx="12" fill="none" stroke="#C9A24A" stroke-width="2" opacity="0.55"/>
  <rect x="32" y="42" width="336" height="556" rx="8" fill="none" stroke="#E8C77E" stroke-width="1" opacity="0.35"/>
  <circle cx="200" cy="320" r="72" fill="none" stroke="#C9A24A" stroke-width="1.5" opacity="0.45"/>
  <path d="M200 248 L208 296 L256 296 L218 326 L232 374 L200 346 L168 374 L182 326 L144 296 L192 296 Z" fill="none" stroke="#E8C77E" stroke-width="1.2" opacity="0.5"/>
</svg>`;

await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toFile(out);
console.log("Created", out);
