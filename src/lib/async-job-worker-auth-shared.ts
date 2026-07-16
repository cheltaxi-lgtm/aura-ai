import type { NextRequest } from "next/server";

export const WORKER_SECRET_HEADER = "x-async-job-worker-secret";
export const WORKER_USER_HEADER = "x-async-job-user-id";
export const WORKER_JOB_HEADER = "x-async-job-id";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Edge-safe constant-time compare (no node:crypto). */
export function secretsMatchEdge(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let out = 0;
  for (let i = 0; i < provided.length; i += 1) {
    out |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return out === 0;
}

export function isWorkerUserId(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value));
}

/**
 * Worker must call Node directly on loopback (ASYNC_JOB_APP_URL=http://127.0.0.1:…).
 * Public traffic via Caddy carries Host=zovus.ru and X-Forwarded-For — reject those.
 */
export function isDirectLoopbackWorkerCall(request: NextRequest): boolean {
  if (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip")) {
    return false;
  }
  const host = (request.headers.get("host") ?? "").trim().toLowerCase();
  return (
    /^127\.0\.0\.1(?::\d+)?$/.test(host) ||
    /^localhost(?::\d+)?$/.test(host) ||
    /^\[::1\](?::\d+)?$/.test(host)
  );
}

export function isNatalWorkerEndpoint(pathname: string): boolean {
  return (
    pathname === "/api/natal-chart/interpretation" ||
    pathname === "/api/natal-chart/forecast" ||
    /^\/api\/natal-chart\/compatibility\/[^/]+\/generate$/.test(pathname)
  );
}

/**
 * Middleware gate: secret + UUID user + loopback-only call.
 */
export function isAuthenticatedNatalWorkerRequest(
  request: NextRequest,
  pathname: string
): boolean {
  if (!isNatalWorkerEndpoint(pathname)) return false;
  if (!isDirectLoopbackWorkerCall(request)) return false;

  const expected = process.env.ASYNC_JOB_WORKER_SECRET;
  const provided = request.headers.get(WORKER_SECRET_HEADER);
  const userId = request.headers.get(WORKER_USER_HEADER);
  if (!expected || !provided || !isWorkerUserId(userId)) return false;
  return secretsMatchEdge(provided, expected);
}

/** Reject non-loopback app URLs so the worker never posts secrets to the public origin. */
export function assertLoopbackAppUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`ASYNC_JOB_APP_URL is not a valid URL: ${url}`);
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error(
      `ASYNC_JOB_APP_URL must be loopback (127.0.0.1/localhost), got ${parsed.hostname}`
    );
  }
  return url.replace(/\/+$/, "");
}
