import type { AuraChakraKey } from "@/lib/aura-constants";

/** viewBox 400 × 680 — full-body figure, chakras, organic field. */
export const AURA_VIZ_VB = { w: 400, h: 680 };

/**
 * Standing luminous body (neck → feet). Head is a separate ellipse
 * so the crown stays smooth. Pose is frontal, gender-neutral.
 * Inner-arm return sits ~20–30 units off the torso; crotch gap ~28 units.
 */
export const AURA_BODY_PATH =
  "M186 104 C188 114 194 122 200 122 C206 122 212 114 214 104 C240 110 262 128 270 154 C278 176 284 210 288 248 L292 320 C294 336 278 344 268 332 L264 240 C260 204 254 174 246 154 C240 176 236 228 234 278 C232 318 238 336 246 344 L254 568 C256 592 246 608 228 606 C214 604 212 584 210 558 L206 372 C204 356 196 356 194 372 L190 558 C188 584 186 604 172 606 C154 608 144 592 146 568 L154 344 C162 336 168 318 166 278 C164 228 160 176 154 154 C146 174 140 204 136 240 L132 332 C122 344 106 336 108 320 L112 248 C116 210 122 176 130 154 C138 128 160 110 186 104 Z";

export const AURA_HEAD = { cx: 200, cy: 78, rx: 23, ry: 27 };

/**
 * Seven organic field contours, innermost → outermost.
 * Shapes stay readable at low blur — not matching ovals.
 */
export const AURA_LAYER_PATHS: readonly string[] = [
  /* etheric — follows the body: shoulders, waist, hips */
  "M200 42 C222 44 238 70 242 108 C248 150 262 186 258 228 C254 268 236 300 232 348 C228 410 224 478 218 538 C214 572 208 592 200 594 C192 592 186 572 182 538 C176 478 172 410 168 348 C164 300 146 268 142 228 C138 186 152 150 158 108 C162 70 178 44 200 42 Z",
  /* emotional — left heart bloom, right side closer */
  "M218 28 C248 24 268 62 262 112 C258 158 270 200 278 248 C272 300 250 348 242 410 C234 478 220 540 206 574 C196 594 180 598 168 586 C146 564 136 510 130 450 C122 380 108 318 118 258 C128 200 136 150 148 104 C162 58 190 30 218 28 Z",
  /* mental — tall crown, slim lower field */
  "M200 12 C248 8 292 48 300 110 C306 168 288 220 274 280 C262 340 256 410 248 478 C240 536 224 580 206 598 C190 610 174 604 162 586 C140 554 128 500 122 436 C114 360 108 290 120 222 C134 154 150 80 186 28 C190 20 196 14 200 12 Z",
  /* astral — right-leaning mid, indented left waist */
  "M176 16 C220 6 300 40 328 112 C348 176 352 250 336 322 C322 390 300 454 272 514 C248 564 220 604 194 616 C170 624 152 610 140 586 C118 540 102 478 96 410 C88 330 92 250 118 186 C140 130 148 70 176 16 Z",
  /* etheric template — shoulder wings, pinched ankles */
  "M210 10 C268 4 330 52 352 124 C368 188 360 260 338 332 C318 400 292 468 262 528 C236 576 210 606 188 610 C160 604 132 568 116 516 C96 452 82 376 90 300 C98 228 120 160 154 100 C176 58 192 16 210 10 Z",
  /* celestial — three soft lobes, heavier on the left hip */
  "M168 12 C210 2 280 18 326 70 C360 118 372 186 358 258 C348 318 330 372 318 430 C304 492 286 548 250 588 C214 624 178 630 150 612 C110 584 78 530 64 462 C50 392 58 318 84 250 C108 186 114 120 138 68 C150 40 158 18 168 12 Z",
  /* causal — open cloud, not a frame */
  "M150 14 C198 2 290 16 348 78 C386 128 392 210 368 292 C350 358 330 420 312 486 C290 556 250 616 196 632 C150 642 96 610 64 548 C34 488 22 408 34 328 C46 250 70 180 108 122 C128 86 136 36 150 14 Z",
];

export const AURA_CHAKRA_POS: Record<AuraChakraKey, { x: number; y: number }> = {
  sahasrara: { x: 200, y: 48 },
  ajna: { x: 200, y: 76 },
  vishuddha: { x: 200, y: 116 },
  anahata: { x: 200, y: 174 },
  manipura: { x: 200, y: 230 },
  svadhisthana: { x: 200, y: 280 },
  muladhara: { x: 200, y: 328 },
};

/** Blur per layer (inner → outer). Keep low so contours stay organic. */
export const AURA_LAYER_BLUR = [2.4, 3.2, 4.2, 5.2, 6.4, 8, 10] as const;
