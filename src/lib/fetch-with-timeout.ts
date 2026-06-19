/** Fetch with abort timeout so UI loading states cannot hang forever. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? 12_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const { timeoutMs: _omit, signal, ...rest } = init ?? {};

  try {
    return await fetch(input, {
      ...rest,
      signal: signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
