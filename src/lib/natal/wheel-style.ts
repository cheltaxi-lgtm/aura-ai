export const MAJOR_ASPECT_TYPES = new Set([
  "conjunction", "opposition", "square", "trine", "sextile",
]);

export function isMajorAspect(type: string): boolean {
  return MAJOR_ASPECT_TYPES.has(type);
}

export function aspectLineStyle(
  type: string,
  emphasized: boolean,
): { width: number; opacity: number } {
  const major = isMajorAspect(type);
  if (emphasized) return { width: major ? 3.6 : 2.5, opacity: 1 };
  return { width: major ? 2.35 : 1.4, opacity: major ? 0.84 : 0.52 };
}
