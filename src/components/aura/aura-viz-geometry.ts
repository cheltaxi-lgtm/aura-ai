import type { AuraChakraKey } from "@/lib/aura-constants";

/** viewBox 400 × 680 — full-body figure, chakras, organic field. */
export const AURA_VIZ_VB = { w: 400, h: 680 };

/**
 * Standing figure waypoints. Inner-arm and crotch points are the
 * negative-space gate: at ~296px the holes must read as arms and a stride,
 * not a fused pawn/egg.
 */
export const AURA_BODY = {
  neckL: { x: 184, y: 118 },
  neck: { x: 200, y: 134 },
  neckR: { x: 216, y: 118 },

  shoulderR: { x: 262, y: 150 },
  armOuterMidR: { x: 280, y: 230 },
  wristR: { x: 284, y: 318 },
  handR: { x: 266, y: 336 },
  armInnerMidR: { x: 258, y: 228 },
  armpitR: { x: 236, y: 164 },

  waistR: { x: 222, y: 248 },
  hipR: { x: 242, y: 340 },
  ankleOuterR: { x: 250, y: 530 },
  heelR: { x: 256, y: 578 },
  toeTipR: { x: 278, y: 586 },
  toeInnerR: { x: 228, y: 576 },
  ankleInnerR: { x: 222, y: 528 },
  crotchR: { x: 226, y: 368 },

  crotch: { x: 200, y: 360 },

  crotchL: { x: 174, y: 368 },
  ankleInnerL: { x: 178, y: 528 },
  toeInnerL: { x: 172, y: 576 },
  toeTipL: { x: 122, y: 586 },
  heelL: { x: 144, y: 578 },
  ankleOuterL: { x: 150, y: 530 },
  hipL: { x: 158, y: 340 },
  waistL: { x: 178, y: 248 },

  armpitL: { x: 164, y: 164 },
  armInnerMidL: { x: 142, y: 228 },
  handL: { x: 134, y: 336 },
  wristL: { x: 116, y: 318 },
  armOuterMidL: { x: 120, y: 230 },
  shoulderL: { x: 138, y: 150 },
} as const;

/** Minimum holes (viewBox units) so the pose survives the 18.5rem mobile stage. */
export const AURA_BODY_GAPS = {
  arm: AURA_BODY.armInnerMidR.x - AURA_BODY.waistR.x,
  crotch: AURA_BODY.crotchR.x - AURA_BODY.crotchL.x,
  stride: AURA_BODY.ankleInnerR.x - AURA_BODY.ankleInnerL.x,
} as const;

function pt(p: { x: number; y: number }): string {
  return `${p.x} ${p.y}`;
}

/**
 * Frontal, gender-neutral body. Outer contours stay cubic; inner-arm and
 * crotch use hard lines so the negative space does not fill in.
 */
export const AURA_BODY_PATH = [
  `M${pt(AURA_BODY.neckL)}`,
  `C188 126 194 134 ${pt(AURA_BODY.neck)}`,
  `C206 134 212 126 ${pt(AURA_BODY.neckR)}`,
  `C238 124 252 134 ${pt(AURA_BODY.shoulderR)}`,
  `C272 168 278 196 ${pt(AURA_BODY.armOuterMidR)}`,
  `C282 268 286 300 ${pt(AURA_BODY.wristR)}`,
  `C286 330 274 340 ${pt(AURA_BODY.handR)}`,
  `L${pt(AURA_BODY.armInnerMidR)}`,
  `L${pt(AURA_BODY.armpitR)}`,
  `C228 180 224 210 ${pt(AURA_BODY.waistR)}`,
  `C220 286 226 318 ${pt(AURA_BODY.hipR)}`,
  `C238 400 246 470 ${pt(AURA_BODY.ankleOuterR)}`,
  `L${pt(AURA_BODY.heelR)}`,
  `L${pt(AURA_BODY.toeTipR)}`,
  `L${pt(AURA_BODY.toeInnerR)}`,
  `L${pt(AURA_BODY.ankleInnerR)}`,
  `L${pt(AURA_BODY.crotchR)}`,
  `L${pt(AURA_BODY.crotch)}`,
  `L${pt(AURA_BODY.crotchL)}`,
  `L${pt(AURA_BODY.ankleInnerL)}`,
  `L${pt(AURA_BODY.toeInnerL)}`,
  `L${pt(AURA_BODY.toeTipL)}`,
  `L${pt(AURA_BODY.heelL)}`,
  `L${pt(AURA_BODY.ankleOuterL)}`,
  `C154 470 162 400 ${pt(AURA_BODY.hipL)}`,
  `C174 318 180 286 ${pt(AURA_BODY.waistL)}`,
  `C176 210 172 180 ${pt(AURA_BODY.armpitL)}`,
  `L${pt(AURA_BODY.armInnerMidL)}`,
  `L${pt(AURA_BODY.handL)}`,
  `C126 340 114 330 ${pt(AURA_BODY.wristL)}`,
  `C114 300 118 268 ${pt(AURA_BODY.armOuterMidL)}`,
  `C122 196 128 168 ${pt(AURA_BODY.shoulderL)}`,
  `C148 134 162 124 ${pt(AURA_BODY.neckL)}`,
  "Z",
].join(" ");

export const AURA_HEAD = { cx: 200, cy: 86, rx: 28, ry: 34 };

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
