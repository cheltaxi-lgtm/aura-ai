/** Normalize a slot name so «Маша» and «маша» share one other-person slot. */
export function auraSubjectNameKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}
