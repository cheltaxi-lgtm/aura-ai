/** Organic card positions on the divination table felt. */

export interface TableCardLayout {
  x: number;
  y: number;
  rotate: number;
  zIndex: number;
}

function seededTilt(index: number): number {
  return (((index * 7919 + 13) % 23) - 11) * 0.85;
}

/** Overlapping rows — like a real spread cloth, not a rigid grid. */
export function buildTableCardLayout(
  count: number,
  cardW: number,
  cardH: number,
  faceUp: boolean
): { layouts: TableCardLayout[]; canvasW: number; canvasH: number } {
  if (count <= 12 && faceUp) {
    const gap = 14;
    const cols = count <= 3 ? count : count <= 6 ? 3 : 4;
    const rows = Math.ceil(count / cols);
    const canvasW = cols * (cardW + gap) + 32;
    const canvasH = rows * (cardH + gap) + 32;
    const layouts = Array.from({ length: count }, (_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        x: 16 + col * (cardW + gap),
        y: 16 + row * (cardH + gap),
        rotate: seededTilt(i) * 0.4,
        zIndex: i,
      };
    });
    return { layouts, canvasW, canvasH };
  }

  if (count <= 24) {
    const cols = count <= 18 ? 6 : 8;
    const stepX = cardW * 0.78;
    const stepY = cardH * 0.82;
    const rows = Math.ceil(count / cols);
    const canvasW = cols * stepX + cardW * 0.35 + 24;
    const canvasH = rows * stepY + cardH * 0.35 + 24;
    const layouts = Array.from({ length: count }, (_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const stagger = row % 2 === 1 ? stepX * 0.22 : 0;
      return {
        x: 12 + col * stepX + stagger,
        y: 12 + row * stepY,
        rotate: seededTilt(i),
        zIndex: row * cols + col,
      };
    });
    return { layouts, canvasW, canvasH };
  }

  // Full tarot deck — dense overlapping spread
  const cols = 13;
  const stepX = cardW * 0.68;
  const stepY = cardH * 0.72;
  const rows = Math.ceil(count / cols);
  const canvasW = cols * stepX + cardW * 0.5 + 20;
  const canvasH = rows * stepY + cardH * 0.45 + 20;
  const layouts = Array.from({ length: count }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const stagger = row % 2 === 1 ? stepX * 0.18 : 0;
    return {
      x: 8 + col * stepX + stagger,
      y: 8 + row * stepY,
      rotate: seededTilt(i),
      zIndex: row * cols + col,
    };
  });
  return { layouts, canvasW, canvasH };
}

export function tableCardSize(count: number, faceUp: boolean): { w: number; h: number } {
  if (faceUp) {
    if (count >= 9) return { w: 76, h: 118 };
    return { w: 88, h: 132 };
  }
  if (count >= 60) return { w: 34, h: 54 };
  if (count >= 24) return { w: 40, h: 64 };
  return { w: 56, h: 88 };
}
