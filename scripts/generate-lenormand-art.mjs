/**
 * Programmatic Petit Lenormand face art — gold line vignettes on dark violet.
 * Output: public/decks/lenormand/{slug}.svg + manifest.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "public", "decks", "lenormand");

const CARDS = [
  { id: 1, slug: "rider", name: "Всадник" },
  { id: 2, slug: "clover", name: "Клевер" },
  { id: 3, slug: "ship", name: "Корабль" },
  { id: 4, slug: "house", name: "Дом" },
  { id: 5, slug: "tree", name: "Дерево" },
  { id: 6, slug: "clouds", name: "Тучи" },
  { id: 7, slug: "snake", name: "Змея" },
  { id: 8, slug: "coffin", name: "Гроб" },
  { id: 9, slug: "bouquet", name: "Букет" },
  { id: 10, slug: "scythe", name: "Коса" },
  { id: 11, slug: "whip", name: "Метла" },
  { id: 12, slug: "birds", name: "Птицы" },
  { id: 13, slug: "child", name: "Ребёнок" },
  { id: 14, slug: "fox", name: "Лиса" },
  { id: 15, slug: "bear", name: "Медведь" },
  { id: 16, slug: "stars", name: "Звёзды" },
  { id: 17, slug: "stork", name: "Аист" },
  { id: 18, slug: "dog", name: "Собака" },
  { id: 19, slug: "tower", name: "Башня" },
  { id: 20, slug: "garden", name: "Сад" },
  { id: 21, slug: "mountain", name: "Гора" },
  { id: 22, slug: "crossroads", name: "Дорога" },
  { id: 23, slug: "mice", name: "Мыши" },
  { id: 24, slug: "heart", name: "Сердце" },
  { id: 25, slug: "ring", name: "Кольцо" },
  { id: 26, slug: "book", name: "Книга" },
  { id: 27, slug: "letter", name: "Письмо" },
  { id: 28, slug: "man", name: "Мужчина" },
  { id: 29, slug: "woman", name: "Женщина" },
  { id: 30, slug: "lily", name: "Лилия" },
  { id: 31, slug: "sun", name: "Солнце" },
  { id: 32, slug: "moon", name: "Луна" },
  { id: 33, slug: "key", name: "Ключ" },
  { id: 34, slug: "fish", name: "Рыбы" },
  { id: 35, slug: "anchor", name: "Якорь" },
  { id: 36, slug: "cross", name: "Крест" },
];

/** Centered symbolic vignette (paths use local coords ~ -50..50, origin at card center). */
const ART = {
  rider: `
    <g transform="translate(100 148)" stroke="#E8C77E" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M-38 28 Q-20 8 0 12 Q18 8 38 28"/>
      <path d="M-8 12 L-8 -18 Q-8 -32 6 -32 Q18 -32 18 -18 L18 12"/>
      <circle cx="12" cy="-38" r="7"/>
      <path d="M-28 28 L-32 38 M28 28 L32 38"/>
      <path d="M-18 -8 L-24 -22 M18 -8 L24 -22" stroke-width="1"/>
    </g>`,
  clover: `
    <g transform="translate(100 150)" fill="none" stroke="#E8C77E" stroke-width="1.3">
      <path d="M0,-28 C10,-14 10,0 0,14 C-10,0 -10,-14 0,-28 Z"/>
      <path d="M-28,0 C-14,10 0,10 14,0 C0,-10 -14,-10 -28,0 Z"/>
      <path d="M0,28 C10,14 10,0 0,-14 C-10,0 -10,14 0,28 Z"/>
      <path d="M28,0 C14,-10 0,-10 -14,0 C0,10 14,10 28,0 Z"/>
      <circle cx="0" cy="0" r="4" fill="#C9A24A" stroke="none"/>
    </g>`,
  ship: `
    <g transform="translate(100 155)" stroke="#E8C77E" stroke-width="1.3" fill="none" stroke-linejoin="round">
      <path d="M-42 18 Q0 28 42 18 L36 28 Q0 38 -36 28 Z" fill="#2a2240" stroke="#E8C77E"/>
      <path d="M0 -38 L0 18"/>
      <path d="M0 -38 L-28 12"/>
      <path d="M0 -38 L28 12"/>
      <path d="M-46 22 Q0 8 46 22" stroke-width="1" opacity="0.5"/>
    </g>`,
  house: `
    <g transform="translate(100 152)" stroke="#E8C77E" stroke-width="1.3" fill="none">
      <path d="M0,-38 L-38 0 L38 0 Z" fill="#221a34"/>
      <rect x="-28" y="0" width="56" height="38" fill="#1a1428"/>
      <rect x="-8" y="18" width="16" height="20"/>
      <rect x="12" y="8" width="12" height="12"/>
    </g>`,
  tree: `
    <g transform="translate(100 158)" stroke="#E8C77E" stroke-width="1.3" fill="none">
      <rect x="-5" y="8" width="10" height="32" fill="#3a2a18" stroke="#C9A24A"/>
      <circle cx="0" cy="-8" r="22"/>
      <circle cx="-16" cy="4" r="14"/>
      <circle cx="16" cy="4" r="14"/>
      <path d="M-28 40 Q0 46 28 40" stroke-width="1" opacity="0.4"/>
    </g>`,
  clouds: `
    <g transform="translate(100 148)" fill="#2a2240" stroke="#E8C77E" stroke-width="1.3">
      <path d="M-38 8 Q-38 -12 -18 -12 Q-8 -28 8 -18 Q28 -28 32 -8 Q48 -4 38 12 Q42 28 18 24 Q0 34 -18 24 Q-42 28 -38 8 Z"/>
      <path d="M-28 32 Q-8 38 12 32 Q28 36 24 24" fill="none" opacity="0.55"/>
    </g>`,
  snake: `
    <g transform="translate(100 150)" fill="none" stroke="#E8C77E" stroke-width="1.5" stroke-linecap="round">
      <path d="M-38 20 C-28 -8 -8 -18 8 -8 C24 2 32 -12 38 -28"/>
      <circle cx="38" cy="-28" r="5"/>
      <circle cx="40" cy="-30" r="1.2" fill="#E8C77E"/>
    </g>`,
  coffin: `
    <g transform="translate(100 152)" stroke="#E8C77E" stroke-width="1.3" fill="#1a1428">
      <path d="M-22 -32 L22 -32 L32 32 L-32 32 Z"/>
      <path d="M-22 -32 L22 -32 L32 32 L-32 32 Z" fill="none"/>
      <path d="M-14 -32 L14 -32 L22 32 L-22 32 Z" fill="none" opacity="0.45"/>
    </g>`,
  bouquet: `
    <g transform="translate(100 155)" stroke="#E8C77E" stroke-width="1.2" fill="none">
      <path d="M0 32 L0 -8"/>
      <path d="M-6 32 Q-12 18 -8 8"/>
      <path d="M6 32 Q12 18 8 8"/>
      <circle cx="-18" cy="-12" r="10"/><circle cx="0" cy="-22" r="11"/><circle cx="18" cy="-12" r="10"/>
      <circle cx="-10" cy="-28" r="8"/><circle cx="10" cy="-28" r="8"/>
    </g>`,
  scythe: `
    <g transform="translate(100 150)" stroke="#E8C77E" stroke-width="1.4" fill="none" stroke-linecap="round">
      <path d="M-8 38 L-8 -28"/>
      <path d="M-8 -28 Q28 -38 38 -8 Q18 2 -8 -8"/>
    </g>`,
  whip: `
    <g transform="translate(100 150)" stroke="#E8C77E" stroke-width="1.3" fill="none" stroke-linecap="round">
      <path d="M-32 32 Q-20 -8 0 -18 Q20 -28 32 -38"/>
      <path d="M-28 28 Q-16 -4 4 -14 Q24 -24 28 -32" opacity="0.5"/>
      <path d="M32 -38 L38 -28 L28 -32 Z" fill="#C9A24A" stroke="none"/>
    </g>`,
  birds: `
    <g transform="translate(100 148)" stroke="#E8C77E" stroke-width="1.3" fill="none" stroke-linecap="round">
      <path d="M-32 8 Q-18 -8 -4 8 Q10 -8 24 8"/>
      <path d="M-8 18 Q6 4 20 18"/>
      <path d="M-28 12 L-34 4 M20 18 L26 10" stroke-width="1"/>
    </g>`,
  child: `
    <g transform="translate(100 152)" stroke="#E8C77E" stroke-width="1.3" fill="none" stroke-linecap="round">
      <circle cx="0" cy="-28" r="10"/>
      <path d="M0 -18 L0 18"/>
      <path d="M0 -4 L-18 12 M0 -4 L18 12"/>
      <path d="M0 18 L-12 38 M0 18 L12 38"/>
    </g>`,
  fox: `
    <g transform="translate(100 150)" stroke="#E8C77E" stroke-width="1.3" fill="#221a34" stroke-linejoin="round">
      <path d="M-28 -8 L-18 -32 L-4 -14"/>
      <path d="M28 -8 L18 -32 L4 -14"/>
      <path d="M-28 -8 Q0 28 28 -8 Q18 -22 0 -18 Q-18 -22 -28 -8 Z"/>
      <circle cx="-8" cy="-6" r="2" fill="#E8C77E" stroke="none"/>
      <circle cx="8" cy="-6" r="2" fill="#E8C77E" stroke="none"/>
      <path d="M0 -2 L0 8" fill="none"/>
    </g>`,
  bear: `
    <g transform="translate(100 150)" stroke="#E8C77E" stroke-width="1.3" fill="#221a34">
      <circle cx="-22" cy="-28" r="8"/><circle cx="22" cy="-28" r="8"/>
      <path d="M-32 -8 Q0 32 32 -8 Q22 -28 0 -24 Q-22 -28 -32 -8 Z"/>
      <ellipse cx="0" cy="-4" rx="10" ry="8" fill="none"/>
    </g>`,
  stars: `
    <g transform="translate(100 148)" fill="none" stroke="#E8C77E" stroke-width="1.2">
      <path d="M0,-32 L4,-12 L24,-12 L8,0 L14,20 L0,8 L-14,20 L-8,0 L-24,-12 L-4,-12 Z"/>
      <path d="M-32 8 L-28 16 L-20 16 L-26 22 L-24 30 L-32 26 L-40 30 L-38 22 L-44 16 L-36 16 Z" opacity="0.65" transform="scale(0.7)"/>
      <path d="M32 12 L34 18 L40 18 L35 22 L37 28 L32 25 L27 28 L29 22 L24 18 L30 18 Z" opacity="0.55" transform="scale(0.6)"/>
    </g>`,
  stork: `
    <g transform="translate(100 152)" stroke="#E8C77E" stroke-width="1.3" fill="none" stroke-linecap="round">
      <path d="M-8 -32 Q8 -38 18 -22"/>
      <path d="M18 -22 L28 -8 L18 8"/>
      <path d="M18 8 L18 32 L12 38"/>
      <path d="M18 8 L24 38"/>
      <path d="M-8 -32 Q-18 -18 -28 -8 Q-8 0 18 -22"/>
    </g>`,
  dog: `
    <g transform="translate(100 152)" stroke="#E8C77E" stroke-width="1.3" fill="#221a34" stroke-linejoin="round">
      <path d="M-32 -8 Q-28 -28 -12 -24 Q0 -32 12 -24 Q28 -28 32 -8 Q28 18 0 22 Q-28 18 -32 -8 Z"/>
      <circle cx="-10" cy="-8" r="2.5" fill="#E8C77E" stroke="none"/>
      <path d="M0 22 L0 38" fill="none"/>
      <path d="M-8 38 L-14 28 M8 38 L14 28" fill="none"/>
    </g>`,
  tower: `
    <g transform="translate(100 152)" stroke="#E8C77E" stroke-width="1.3" fill="#1a1428">
      <rect x="-18" y="-32" width="36" height="64"/>
      <rect x="-22" y="-38" width="44" height="8" fill="#221a34"/>
      <rect x="-6" y="-12" width="12" height="12" fill="none"/>
      <rect x="-6" y="12" width="12" height="12" fill="none"/>
      <path d="M-18 32 L18 32" fill="none"/>
    </g>`,
  garden: `
    <g transform="translate(100 152)" stroke="#E8C77E" stroke-width="1.2" fill="none">
      <path d="M-38 32 L-38 -18 Q-38 -32 -24 -32 L24 -32 Q38 -32 38 -18 L38 32"/>
      <path d="M-12 32 L-12 -8 Q0 -22 12 -8 L12 32"/>
      <circle cx="0" cy="8" r="6"/>
      <path d="M-28 32 L-28 8 M28 32 L28 8"/>
    </g>`,
  mountain: `
    <g transform="translate(100 158)" stroke="#E8C77E" stroke-width="1.3" fill="#221a34" stroke-linejoin="round">
      <path d="M-42 32 L-8 -28 L8 8 L42 32 Z"/>
      <path d="M-8 -28 L8 8 L28 -18 L42 32" fill="none" opacity="0.5"/>
      <path d="M-42 32 L42 32" fill="none"/>
    </g>`,
  crossroads: `
    <g transform="translate(100 158)" stroke="#E8C77E" stroke-width="1.4" fill="none" stroke-linecap="round">
      <path d="M0 32 L0 -8"/>
      <path d="M0 -8 L-32 -32"/>
      <path d="M0 -8 L32 -32"/>
      <circle cx="0" cy="-8" r="5"/>
    </g>`,
  mice: `
    <g transform="translate(100 152)" stroke="#E8C77E" stroke-width="1.2" fill="#221a34">
      <ellipse cx="-16" cy="8" rx="14" ry="10"/>
      <circle cx="-24" cy="0" r="7"/><path d="M-32 0 L-38 -4" fill="none"/>
      <path d="M-22 18 L-28 28 M-10 18 L-4 28" fill="none"/>
      <ellipse cx="18" cy="12" rx="12" ry="9"/>
      <circle cx="10" cy="4" r="6"/><path d="M2 4 L-4 0" fill="none"/>
      <path d="M14 22 L8 32 M22 22 L28 32" fill="none"/>
    </g>`,
  heart: `
    <g transform="translate(100 150)" fill="#3a1830" stroke="#E8C77E" stroke-width="1.4">
      <path d="M0 28 C-28 4 -28 -22 0 -8 C28 -22 28 4 0 28 Z"/>
    </g>`,
  ring: `
    <g transform="translate(100 150)" fill="none" stroke="#E8C77E" stroke-width="2.2">
      <circle cx="0" cy="0" r="28"/>
      <circle cx="0" cy="-28" r="6" fill="#C9A24A" stroke="#F0D88A" stroke-width="1"/>
    </g>`,
  book: `
    <g transform="translate(100 152)" stroke="#E8C77E" stroke-width="1.3" fill="#1a1428">
      <path d="M-32 -28 L0 -18 L32 -28 L32 32 L0 22 L-32 32 Z"/>
      <path d="M0 -18 L0 22" fill="none"/>
      <path d="M-18 -8 L-8 -6 M-18 2 L-8 4 M-18 12 L-8 14" fill="none" stroke-width="1"/>
    </g>`,
  letter: `
    <g transform="translate(100 152)" stroke="#E8C77E" stroke-width="1.3" fill="#221a34">
      <rect x="-32" y="-22" width="64" height="44" rx="2"/>
      <path d="M-32 -22 L0 8 L32 -22" fill="none"/>
      <path d="M-32 22 L0 -8 L32 22" fill="none" opacity="0.35"/>
    </g>`,
  man: `
    <g transform="translate(100 152)" stroke="#E8C77E" stroke-width="1.3" fill="none" stroke-linecap="round">
      <circle cx="0" cy="-28" r="11"/>
      <path d="M0 -17 L0 14"/>
      <path d="M0 -4 L-22 8 M0 -4 L22 8"/>
      <path d="M0 14 L-14 38 M0 14 L14 38"/>
      <rect x="-18" y="-8" width="36" height="22" rx="2" opacity="0.35"/>
    </g>`,
  woman: `
    <g transform="translate(100 152)" stroke="#E8C77E" stroke-width="1.3" fill="none" stroke-linecap="round">
      <circle cx="0" cy="-28" r="11"/>
      <path d="M-12 -32 Q0 -42 12 -32" stroke-width="1"/>
      <path d="M0 -17 L0 14"/>
      <path d="M0 -4 L-22 8 M0 -4 L22 8"/>
      <path d="M0 14 L-18 38 M0 14 L18 38"/>
      <path d="M-16 14 Q0 32 16 14" fill="#221a34"/>
    </g>`,
  lily: `
    <g transform="translate(100 155)" stroke="#E8C77E" stroke-width="1.2" fill="none">
      <path d="M0 32 L0 -8"/>
      <path d="M0 -8 Q-22 -28 -8 -38 Q0 -28 0 -8"/>
      <path d="M0 -8 Q22 -28 8 -38 Q0 -28 0 -8"/>
      <path d="M0 -8 Q-8 -32 8 -32 Q0 -18 0 -8"/>
      <circle cx="0" cy="-8" r="4" fill="#C9A24A" stroke="none"/>
    </g>`,
  sun: `
    <g transform="translate(100 150)" stroke="#E8C77E" stroke-width="1.3" fill="#3a2810">
      <circle cx="0" cy="0" r="22"/>
      <path d="M0,-38 L0,-28 M0,28 L0,38 M-38,0 L-28,0 M28,0 L38,0 M-27,-27 L-20,-20 M27,-27 L20,-20 M-27,27 L-20,20 M27,27 L20,20"/>
    </g>`,
  moon: `
    <g transform="translate(100 150)" fill="none" stroke="#E8C77E" stroke-width="1.4">
      <path d="M12 -32 A28 28 0 1 0 12 32 A20 20 0 1 1 12 -32 Z" fill="#221a34"/>
      <circle cx="-8" cy="-12" r="2" fill="#E8C77E" opacity="0.5" stroke="none"/>
      <circle cx="4" cy="8" r="1.5" fill="#E8C77E" opacity="0.35" stroke="none"/>
    </g>`,
  key: `
    <g transform="translate(100 150)" stroke="#E8C77E" stroke-width="1.4" fill="none" stroke-linecap="round">
      <circle cx="-12" cy="-18" r="14"/>
      <circle cx="-12" cy="-18" r="6"/>
      <path d="M2 -18 L32 -18 L32 -8 L22 -8 L22 8 L14 8 L14 -8"/>
    </g>`,
  fish: `
    <g transform="translate(100 152)" stroke="#E8C77E" stroke-width="1.3" fill="#221a34">
      <ellipse cx="-14" cy="4" rx="22" ry="12"/>
      <path d="M-36 4 L-48 -8 L-48 16 Z"/>
      <circle cx="-6" cy="2" r="2" fill="#E8C77E" stroke="none"/>
      <ellipse cx="20" cy="-8" rx="18" ry="10"/>
      <path d="M38 -8 L48 -18 L48 2 Z"/>
      <circle cx="26" cy="-10" r="1.8" fill="#E8C77E" stroke="none"/>
    </g>`,
  anchor: `
    <g transform="translate(100 152)" stroke="#E8C77E" stroke-width="1.4" fill="none" stroke-linecap="round">
      <circle cx="0" cy="-28" r="8"/>
      <path d="M0 -20 L0 28"/>
      <path d="M-28 18 Q0 38 28 18"/>
      <path d="M-18 8 L-28 18 M18 8 L28 18"/>
      <path d="M-12 -28 L12 -28"/>
    </g>`,
  cross: `
    <g transform="translate(100 150)" stroke="#E8C77E" stroke-width="1.6" fill="none" stroke-linecap="round">
      <path d="M0 -38 L0 38"/>
      <path d="M-22 -8 L22 -8"/>
    </g>`,
};

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function cardSvg(card) {
  const art = ART[card.slug];
  if (!art) throw new Error(`Missing art for ${card.slug}`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 320" width="200" height="320">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2a2240"/>
      <stop offset="45%" stop-color="#16102a"/>
      <stop offset="100%" stop-color="#0a0814"/>
    </linearGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F5E6B8"/>
      <stop offset="50%" stop-color="#C9A24A"/>
      <stop offset="100%" stop-color="#7a5a22"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="45%">
      <stop offset="0%" stop-color="#E8C77E" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#E8C77E" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" rx="10"/>
  <rect width="100%" height="100%" fill="url(#glow)" rx="10"/>
  <rect x="10" y="14" width="180" height="292" fill="none" stroke="url(#gold)" stroke-width="1.8" opacity="0.8" rx="7"/>
  <rect x="18" y="22" width="164" height="276" fill="none" stroke="#E8C77E" stroke-width="0.6" opacity="0.25" rx="5"/>
  <text x="100" y="48" text-anchor="middle" font-family="Georgia, serif" font-size="14" fill="url(#gold)" opacity="0.85">${card.id}</text>
  ${art}
  <text x="100" y="278" text-anchor="middle" font-family="Georgia, serif" font-size="11" letter-spacing="0.5" fill="#E8C77E" opacity="0.9">${escapeXml(card.name)}</text>
</svg>
`;
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = { version: 1, items: {} };

  for (const card of CARDS) {
    const file = `${card.slug}.svg`;
    const dest = path.join(OUT, file);
    fs.writeFileSync(dest, cardSvg(card), "utf8");
    manifest.items[card.slug] = {
      name: card.name,
      file,
      source: "programmatic",
      id: card.id,
    };
    console.log(`  ${file} — ${card.name}`);
  }

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nWrote ${CARDS.length} Lenormand faces → ${OUT}`);
}

main();
