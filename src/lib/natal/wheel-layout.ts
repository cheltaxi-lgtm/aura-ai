/** Radial lane stacking so nearby longitudes do not paint on top of each other. */

export function layoutWheelBodies<T extends { longitude: number }>(
  items: readonly T[],
  minGapDeg = 13,
  laneCount = 4,
): Array<T & { lane: number }> {
  const laid = [...items]
    .sort((a, b) => a.longitude - b.longitude)
    .map((item) => ({ ...item, lane: 0 }));
  if (laid.length === 0) return laid;

  laid.forEach((item, index) => {
    const previous = laid[(index - 1 + laid.length) % laid.length];
    const gap = index === 0
      ? item.longitude + 360 - previous.longitude
      : item.longitude - previous.longitude;
    item.lane = gap < minGapDeg ? (previous.lane + 1) % laneCount : 0;
  });

  if (laid.length > 1) {
    const wrap = laid[0].longitude + 360 - laid[laid.length - 1].longitude;
    if (wrap < minGapDeg && laid[0].lane === laid[laid.length - 1].lane) {
      laid[0].lane = (laid[laid.length - 1].lane + 1) % laneCount;
    }
  }

  return laid;
}

export function wheeledRadius(base: number, lane: number, step: number): number {
  return Math.max(base * 0.55, base - lane * step);
}
