export type MemoryDepth = "compact" | "standard" | "deep";

export type MemoryBudget = {
  depth: MemoryDepth;
  maxFactLines: number;
  maxBlockChars: number;
  maxCore: number;
  maxPeople: number;
  maxTimeline: number;
  maxSessions: number;
};

const BUDGETS: Record<MemoryDepth, Omit<MemoryBudget, "depth">> = {
  compact: {
    maxFactLines: 6,
    maxBlockChars: 2200,
    maxCore: 3,
    maxPeople: 2,
    maxTimeline: 1,
    maxSessions: 1,
  },
  standard: {
    maxFactLines: 12,
    maxBlockChars: 4000,
    maxCore: 5,
    maxPeople: 4,
    maxTimeline: 3,
    maxSessions: 3,
  },
  deep: {
    maxFactLines: 18,
    maxBlockChars: 5500,
    maxCore: 6,
    maxPeople: 6,
    maxTimeline: 5,
    maxSessions: 4,
  },
};

export function resolveMemoryDepth(params: {
  depth?: MemoryDepth | null;
  product?: string | null;
  queryText?: string | null;
}): MemoryDepth {
  if (params.depth) return params.depth;
  const product = (params.product ?? "").toLowerCase();
  if (
    /natal|hd|human.?design|matrix|reading|intention|ritual|report|photo/.test(
      product
    )
  ) {
    return "deep";
  }
  if (/daily/.test(product)) return "compact";
  const q = params.queryText?.trim() ?? "";
  if (q.length > 0 && q.length < 24 && !/[?]/.test(q)) return "compact";
  return "standard";
}

export function memoryBudgetFor(depth: MemoryDepth): MemoryBudget {
  return { depth, ...BUDGETS[depth] };
}

/** Candidate-pool size. Final prompt budgets stay bounded separately. */
export function memoryCandidateLimit(opts: {
  depth?: MemoryDepth | null;
  includeArchived?: boolean;
  wantsTimeline?: boolean;
}): number {
  if (opts.includeArchived || opts.wantsTimeline || opts.depth === "deep") return 40;
  return 16;
}
