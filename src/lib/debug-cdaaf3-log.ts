/**
 * Legacy debug helper — permanently disabled (no disk / ingest side effects).
 */
export function debugCdaaf3Log(_payload: {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  runId?: string;
}) {
  /* no-op */
}
