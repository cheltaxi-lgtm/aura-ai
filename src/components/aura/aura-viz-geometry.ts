import type { AuraChakraKey, AuraLayerKey } from "@/lib/aura-constants";

/** Wide cinematic scene — the figure is light, not a stroked path. */
export const AURA_VIZ_VB = { w: 400, h: 560 };

/**
 * Soft standing presence. Used only as a dissolving mask — never stroked.
 * Slightly asymmetric so it does not read as a pictogram stencil.
 */
export const AURA_PRESENCE_PATH =
  "M201 68 C224 66 243 84 241 110 C240 128 230 140 220 148 C258 154 304 172 314 214 C322 248 306 286 280 308 C262 324 248 312 244 294 C254 338 252 392 240 438 C230 476 214 502 200 512 C184 502 166 474 156 436 C146 390 150 338 158 294 C150 312 132 324 114 306 C92 282 80 244 90 208 C102 170 146 152 180 148 C170 138 160 126 160 110 C158 84 176 70 201 68 Z";

/**
 * Inner luminous volumes, drawn only inside the presence mask.
 * Not a body outline — chest/head glow only.
 */
export const AURA_LIGHT = {
  head: { cx: 200, cy: 108, rx: 26, ry: 30 },
  chest: { cx: 198, cy: 214, rx: 34, ry: 46 },
} as const;

export type AuraFieldMass = {
  key: AuraLayerKey;
  /** Irregular atmospheric blot — not an oval shell. */
  d: string;
};

/**
 * Seven spatial masses that compose one field in the hero.
 * Explorer mode isolates a single mass. None is a concentric ring.
 */
export const AURA_FIELD_MASSES: readonly AuraFieldMass[] = [
  {
    key: "etheric",
    d: "M176 128 C206 108 228 148 222 210 C218 268 208 330 196 392 C184 430 168 418 164 360 C158 290 152 210 164 160 C168 140 160 132 176 128 Z",
  },
  {
    key: "emotional",
    d: "M62 168 C108 128 168 148 178 214 C186 268 156 318 118 336 C78 348 48 300 46 246 C44 200 36 178 62 168 Z",
  },
  {
    key: "mental",
    d: "M168 18 C214 2 268 28 278 82 C284 122 248 148 206 142 C164 136 132 102 128 64 C126 36 144 22 168 18 Z",
  },
  {
    key: "astral",
    d: "M246 132 C308 108 356 168 342 246 C330 318 278 352 236 330 C206 314 204 250 218 196 C226 160 220 140 246 132 Z",
  },
  {
    key: "etheric_template",
    d: "M48 150 C120 78 210 88 300 118 C348 138 362 188 320 206 C260 228 180 198 110 188 C70 182 28 172 48 150 Z",
  },
  {
    key: "celestial",
    d: "M18 292 C78 246 142 278 148 348 C152 408 108 468 58 478 C18 484 2 420 12 360 C16 328 4 308 18 292 Z",
  },
  {
    key: "causal",
    d: "M8 72 C96 8 230 22 318 88 C368 128 378 198 330 228 C270 258 210 200 130 178 C70 162 -6 140 8 72 Z",
  },
];

export const AURA_CHAKRA_POS: Record<AuraChakraKey, { x: number; y: number }> = {
  sahasrara: { x: 201, y: 76 },
  ajna: { x: 200, y: 108 },
  vishuddha: { x: 200, y: 148 },
  anahata: { x: 198, y: 204 },
  manipura: { x: 198, y: 248 },
  svadhisthana: { x: 199, y: 290 },
  muladhara: { x: 200, y: 328 },
};
