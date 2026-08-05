/** Safety stubs for S0 — crisis/output filters land in S1. */

export function detectCrisis(_text: string): { crisis: boolean; reasons: string[] } {
  return { crisis: false, reasons: [] };
}

export function filterPractitionerOutput(text: string): {
  ok: boolean;
  text: string;
  blocked: string[];
} {
  return { ok: true, text, blocked: [] };
}
