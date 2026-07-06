/** Maps alternate keyword intents to a single canonical path (anti-duplicate). */
export const CANONICAL_ALIASES: Record<string, string> = {
  "/cards/masti/zhezly-znachenie": "/cards/masti/zhezly",
  "/cards/masti/mechi-znachenie": "/cards/masti/mechi",
  "/cards/masti/kubki-znachenie": "/cards/masti/kubki",
  "/cards/masti/pentakli-znachenie": "/cards/masti/pentakli",
};

export function resolveCanonicalPath(path: string): string {
  return CANONICAL_ALIASES[path] ?? path;
}
