type ReleaseFn = () => void;

type QueueEntry = {
  label: string;
  enqueuedAt: number;
  resolve: (release: ReleaseFn) => void;
  timer: ReturnType<typeof setTimeout>;
};

function readMaxConcurrency(): number {
  const raw = Number(process.env.LLM_CONCURRENCY_MAX);
  if (Number.isFinite(raw) && raw >= 1) return Math.floor(raw);
  return 25;
}

/**
 * Background/fire-and-forget calls (e.g. memory fact extraction) get their own
 * small slice of concurrency so they never starve user-facing chat/reading
 * completions of slots in the shared queue.
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

const gate = new LlmConcurrencyGate(readMaxConcurrency());
const backgroundGate = new LlmConcurrencyGate(readBackgroundMaxConcurrency());

export type LlmPool = "default" | "background";

function resolveGate(pool?: LlmPool): LlmConcurrencyGate {
  return pool === "background" ? backgroundGate : gate;
}

export function getLlmConcurrencyStats() {
  return { ...gate.stats(), background: backgroundGate.stats() };
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
