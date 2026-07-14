export function evidenceAnchorId(prefix: string, value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-|-$/g, "");
  return slug ? `${prefix}-${slug}` : prefix;
}
