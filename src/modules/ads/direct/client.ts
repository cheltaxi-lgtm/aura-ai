/**
 * Yandex Direct API v5 JSON client with Units throttling and safe logging.
 */
import { canMutateDirect } from "../config";

type DirectError = {
  error_code?: number;
  error_string?: string;
  error_detail?: string;
};

export class DirectApiError extends Error {
  constructor(
    message: string,
    public code?: number,
    public detail?: string
  ) {
    super(message);
    this.name = "DirectApiError";
  }
}

let lastCallAt = 0;
const MIN_GAP_MS = 200;

/** In-memory log of mutating Direct calls (never includes tokens). */
const writeCallLog: { service: string; method: string; at: number }[] = [];

export function getDirectWriteLog() {
  return [...writeCallLog];
}

export function clearDirectWriteLog() {
  writeCallLog.length = 0;
}

/** Same gate as canMutateDirect (enabled + autopilot.write + ADS_RULES_MODE=apply). */
export async function writesAllowed(): Promise<boolean> {
  return canMutateDirect();
}

function baseUrl(): string {
  const sandbox =
    process.env.ADS_DIRECT_SANDBOX === "1" || process.env.ADS_DIRECT_SANDBOX === "true";
  return sandbox
    ? "https://api-sandbox.direct.yandex.com/json/v5"
    : "https://api.direct.yandex.com/json/v5";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type DirectCallResult<T> = {
  result: T;
  units: string | null;
};

export async function directCall<T>(
  service: string,
  method: string,
  params: unknown,
  opts?: { mutate?: boolean; safetyPause?: boolean }
): Promise<DirectCallResult<T>> {
  const token = process.env.ADS_DIRECT_TOKEN;
  const login = process.env.ADS_DIRECT_LOGIN;
  if (!token) throw new DirectApiError("ADS_DIRECT_TOKEN missing");

  // Safety pauses (budget/freshness/landing/emergency) ignore dry_run / write flags.
  const safety =
    opts?.safetyPause === true &&
    (method === "suspend" || method === "delete" || service === "campaigns");

  if (opts?.mutate && !safety && !(await writesAllowed())) {
    throw new DirectApiError(
      `Direct write blocked (dry_run or ADS_AUTOPILOT_WRITE off): ${service}.${method}`
    );
  }
  if (opts?.mutate) {
    writeCallLog.push({ service, method, at: Date.now() });
  }

  const gap = Date.now() - lastCallAt;
  if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);

  let attempt = 0;
  const maxAttempts = 5;
  while (attempt < maxAttempts) {
    attempt++;
    lastCallAt = Date.now();
    const res = await fetch(`${baseUrl()}/${service}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Login": login || "",
        "Accept-Language": "ru",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ method, params }),
    });
    const units = res.headers.get("Units");
    const json = (await res.json()) as { result?: T; error?: DirectError };

    if (res.status === 429 || res.status >= 500) {
      await sleep(Math.min(60_000, 1000 * 2 ** attempt));
      continue;
    }
    if (json.error) {
      throw new DirectApiError(
        json.error.error_string || "Direct API error",
        json.error.error_code,
        json.error.error_detail
      );
    }
    if (opts?.mutate) {
      // placeholder for audit — never log token
    }
    return { result: json.result as T, units };
  }
  throw new DirectApiError("Direct API exhausted retries");
}

export function isSandbox(): boolean {
  return process.env.ADS_DIRECT_SANDBOX === "1" || process.env.ADS_DIRECT_SANDBOX === "true";
}
