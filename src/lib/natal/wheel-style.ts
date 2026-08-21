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
  if (emphasized) return { width: major ? 4.2 : 2.6, opacity: 1 };
  return { width: major ? 3.15 : 1.7, opacity: major ? 0.96 : 0.4 };
}
