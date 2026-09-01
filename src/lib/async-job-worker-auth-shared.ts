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
  const host = (request.headers.get("host") ?? "").trim().toLowerCase();
  const loopbackHost =
    /^127\.0\.0\.1(?::\d+)?$/.test(host) ||
    /^localhost(?::\d+)?$/.test(host) ||
    /^\[::1\](?::\d+)?$/.test(host);
  if (!loopbackHost) return false;

  // Next's Node server may synthesize x-forwarded-for from req.socket even on
  // a direct 127.0.0.1 request. Reject only non-loopback hops; public Caddy
  // requests are already excluded by Host=zovus.ru and carry a public address.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((value) => value.trim()).filter(Boolean);
    if (hops.some((value) => !isLoopbackAddress(value))) return false;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp && !isLoopbackAddress(realIp)) return false;

  return true;
}

function isLoopbackAddress(value: string): boolean {
  const normalized = value.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "::ffff:127.0.0.1"
  );
}

/** @deprecated use isAsyncJobWorkerEndpoint */
export function isNatalWorkerEndpoint(pathname: string): boolean {
  return isAsyncJobWorkerEndpoint(pathname);
}

/**
 * Pathnames the durable worker may invoke with the worker secret.
 * Kept edge-safe (no Node-only imports): mirror of async-job-registry paths.
 */
export function isAsyncJobWorkerEndpoint(pathname: string): boolean {
  return (
    pathname === "/api/natal-chart/interpretation" ||
    pathname === "/api/natal-chart/forecast" ||
    /^\/api\/natal-chart\/compatibility\/[^/]+\/generate$/.test(pathname) ||
    pathname === "/api/reading" ||
    pathname === "/api/intention-spread" ||
    pathname === "/api/daily-reading" ||
    pathname === "/api/photo-reading/stream" ||
    pathname === "/api/image/generate" ||
    pathname === "/api/joint-reading/create" ||
    /^\/api\/joint-reading\/[^/]+\/combine$/.test(pathname) ||
    /^\/api\/ritual\/[^/]+\/regenerate$/.test(pathname) ||
    pathname === "/api/human-design/report" ||
    pathname === "/api/human-design/composite-report" ||
    pathname === "/api/pro/jobs/premium-report" ||
    pathname === "/api/aura/report" ||
    pathname === "/api/palm/report"
  );
}

/**
 * Middleware gate: secret + UUID user + loopback-only call.
 */
export function isAuthenticatedAsyncJobWorkerRequest(
  request: NextRequest,
  pathname: string
): boolean {
  if (!isAsyncJobWorkerEndpoint(pathname)) return false;
  if (!isDirectLoopbackWorkerCall(request)) return false;

  const expected = process.env.ASYNC_JOB_WORKER_SECRET;
  const provided = request.headers.get(WORKER_SECRET_HEADER);
  const userId = request.headers.get(WORKER_USER_HEADER);
  if (!expected || !provided || !isWorkerUserId(userId)) return false;
  return secretsMatchEdge(provided, expected);
}

/** @deprecated use isAuthenticatedAsyncJobWorkerRequest */
export function isAuthenticatedNatalWorkerRequest(
  request: NextRequest,
  pathname: string
): boolean {
  return isAuthenticatedAsyncJobWorkerRequest(request, pathname);
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
