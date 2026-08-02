/**
 * Structured error reporting.
 * - Always JSON to stderr
 * - Optional @sentry/nextjs when SENTRY_DSN is set
 * - Optional ERROR_WEBHOOK_URL (Slack/Discord-style POST JSON)
 */
export function reportError(
  error: unknown,
  context?: Record<string, unknown>
): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const payload = {
    level: "error",
    message,
    stack,
    ...context,
    ts: new Date().toISOString(),
  };
  console.error(JSON.stringify(payload));

  const dsn = process.env.SENTRY_DSN?.trim();
  if (dsn) {
    try {
      // Optional peer — avoid hard dependency until Sentry is installed.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require("@sentry/nextjs") as {
        captureException?: (err: unknown, hint?: { extra?: Record<string, unknown> }) => void;
      };
      Sentry.captureException?.(error, { extra: context });
    } catch {
      /* Sentry not installed */
    }
  }

  const webhook = process.env.ERROR_WEBHOOK_URL?.trim();
  if (webhook) {
    void fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `[Zovus] ${message}`,
        ...payload,
      }),
    }).catch(() => {});
  }
}
