/**
 * Pause report-lane claims when OpenRouter/upstream is failing hard.
 * In-memory per worker process — good enough for single-host Beget VM.
 */

type BreakerState = {
  failures: number[];
  openUntil: number;
};

const state: BreakerState = { failures: [], openUntil: 0 };

/** pending Phase 0 calibration */
const WINDOW_MS = Math.max(10_000, Number(process.env.ASYNC_REPORT_CB_WINDOW_MS) || 120_000);
const THRESHOLD = Math.max(3, Number(process.env.ASYNC_REPORT_CB_THRESHOLD) || 8);
const COOLDOWN_MS = Math.max(15_000, Number(process.env.ASYNC_REPORT_CB_COOLDOWN_MS) || 90_000);

function prune(now: number): void {
  state.failures = state.failures.filter((t) => now - t < WINDOW_MS);
}

export function recordReportProviderFailure(kind: "429" | "5xx" | "timeout" | "other" = "other"): void {
  const now = Date.now();
  prune(now);
  state.failures.push(now);
  if (state.failures.length >= THRESHOLD) {
    state.openUntil = now + COOLDOWN_MS;
    console.warn(
      `[async-report-cb] OPEN failures=${state.failures.length} kind=${kind} cooldownMs=${COOLDOWN_MS}`
    );
  }
}

export function recordReportProviderSuccess(): void {
  // Slow recovery: drop one failure token.
  if (state.failures.length) state.failures.shift();
}

export function isReportClaimPaused(): boolean {
  const now = Date.now();
  if (now < state.openUntil) return true;
  prune(now);
  return false;
}

export function getReportCircuitBreakerStats() {
  const now = Date.now();
  prune(now);
  return {
    open: now < state.openUntil,
    openUntil: state.openUntil || null,
    failuresInWindow: state.failures.length,
    threshold: THRESHOLD,
    windowMs: WINDOW_MS,
    cooldownMs: COOLDOWN_MS,
  };
}
