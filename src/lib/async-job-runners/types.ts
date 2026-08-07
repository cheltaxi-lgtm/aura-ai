export type ReportJobRunResult =
  | { ok: true; result: Record<string, unknown> }
  | {
      ok: false;
      message: string;
      code?: string;
      needsRegeneration?: boolean;
      retryAfterMs?: number;
    };
