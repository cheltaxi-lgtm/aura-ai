type ReleaseFn = () => void;

type QueueEntry = {
  label: string;
  enqueuedAt: number;
  resolve: (release: ReleaseFn) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** Total slots across interactive+report. pending Phase 0 calibration */
function readMaxConcurrency(): number {
  const raw = Number(process.env.LLM_CONCURRENCY_MAX);
  if (Number.isFinite(raw) && raw >= 1) return Math.floor(raw);
  return 25;
}

/**
 * Interactive (chat / ask) gets ≥60% of LLM_CONCURRENCY_MAX so paid report
 * generation cannot starve live dialogue. pending Phase 0 calibration
 */
function readInteractiveMaxConcurrency(): number {
  const total = readMaxConcurrency();
  const raw = Number(process.env.LLM_INTERACTIVE_CONCURRENCY_MAX);
  if (Number.isFinite(raw) && raw >= 1) return Math.min(total, Math.floor(raw));
  return Math.max(1, Math.ceil(total * 0.6));
}

/**
 * Report pool = remainder (≤40%). Worker / long paid reports use only this
 * pool. pending Phase 0 calibration
 */
function readReportMaxConcurrency(): number {
  const total = readMaxConcurrency();
  const interactive = readInteractiveMaxConcurrency();
  const raw = Number(process.env.LLM_REPORT_CONCURRENCY_MAX);
  if (Number.isFinite(raw) && raw >= 1) {
    return Math.min(total, Math.floor(raw));
  }
  return Math.max(1, total - interactive);
}

/**
 * Background/fire-and-forget calls (e.g. memory fact extraction) get their own
 * small slice so they never starve interactive chat.
 */
function readBackgroundMaxConcurrency(): number {
  const raw = Number(process.env.LLM_BACKGROUND_CONCURRENCY_MAX);
  if (Number.isFinite(raw) && raw >= 1) return Math.floor(raw);
  return Math.max(2, Math.floor(readMaxConcurrency() / 5));
}

function readQueueTimeoutMs(): number {
  const raw = Number(process.env.LLM_QUEUE_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 5_000) return Math.floor(raw);
  return 120_000;
}

class LlmConcurrencyGate {
  private active = 0;
  private readonly queue: QueueEntry[] = [];
  readonly max: number;
  private readonly queueTimeoutMs: number;

  constructor(max: number) {
    this.max = max;
    this.queueTimeoutMs = readQueueTimeoutMs();
  }

  stats() {
    return {
      max: this.max,
      active: this.active,
      queued: this.queue.length,
      queueTimeoutMs: this.queueTimeoutMs,
    };
  }

  async acquire(label: string): Promise<ReleaseFn | null> {
    if (this.active < this.max) {
      this.active++;
      return this.makeRelease();
    }

    return new Promise((resolve) => {
      const entry: QueueEntry = {
        label,
        enqueuedAt: Date.now(),
        resolve,
        timer: setTimeout(() => {
          const idx = this.queue.indexOf(entry);
          if (idx < 0) return;
          this.queue.splice(idx, 1);
          console.warn(
            `LLM queue timeout (${label}), wait=${Date.now() - entry.enqueuedAt}ms queued=${this.queue.length}`
          );
          resolve(null);
        }, this.queueTimeoutMs),
      };
      this.queue.push(entry);
    });
  }

  private makeRelease(): ReleaseFn {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active = Math.max(0, this.active - 1);
      const next = this.queue.shift();
      if (!next) return;
      clearTimeout(next.timer);
      this.active++;
      next.resolve(this.makeRelease());
    };
  }
}

const interactiveGate = new LlmConcurrencyGate(readInteractiveMaxConcurrency());
const reportGate = new LlmConcurrencyGate(readReportMaxConcurrency());
const backgroundGate = new LlmConcurrencyGate(readBackgroundMaxConcurrency());

/** @deprecated alias — maps to interactive for backward-compatible callers */
const gate = interactiveGate;

export type LlmPool = "default" | "interactive" | "report" | "background";

function resolveGate(pool?: LlmPool): LlmConcurrencyGate {
  if (pool === "background") return backgroundGate;
  if (pool === "report") return reportGate;
  // "default" and "interactive" share the interactive FIFO (chat must not
  // wait behind report generation).
  return interactiveGate;
}

export function getLlmConcurrencyStats() {
  return {
    ...interactiveGate.stats(),
    interactive: interactiveGate.stats(),
    report: reportGate.stats(),
    background: backgroundGate.stats(),
    totalConfigured: readMaxConcurrency(),
  };
}

export async function withLlmSlot<T>(
  label: string,
  fn: () => Promise<T>,
  pool?: LlmPool
): Promise<T | null> {
  const release = await resolveGate(pool).acquire(label);
  if (!release) return null;
  try {
    return await fn();
  } finally {
    release();
  }
}

export async function acquireLlmSlot(label: string, pool?: LlmPool): Promise<ReleaseFn | null> {
  return resolveGate(pool).acquire(label);
}

/** Hold slot until upstream ReadableStream finishes or is cancelled. */
export function wrapStreamWithLlmRelease(
  body: ReadableStream<Uint8Array>,
  release: ReleaseFn
): ReadableStream<Uint8Array> {
  let released = false;
  const doRelease = () => {
    if (released) return;
    released = true;
    release();
  };

  const reader = body.getReader();
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          doRelease();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        doRelease();
        controller.error(error);
      }
    },
    cancel(reason) {
      reader.cancel(reason).catch(() => {});
      doRelease();
    },
  });
}
