import fs from "fs";
import path from "path";

const LOG_PATH = path.join(process.cwd(), "debug-cdaaf3.log");

export function debugCdaaf3Log(payload: {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  runId?: string;
}) {
  if (process.env.NODE_ENV === "production" && process.env.DEBUG_CDAAF3 !== "1") {
    return;
  }

  const line = JSON.stringify({
    sessionId: "cdaaf3",
    timestamp: Date.now(),
    ...payload,
  });

  try {
    fs.appendFileSync(LOG_PATH, `${line}\n`, "utf8");
  } catch {
    /* ignore */
  }
  void fetch("http://127.0.0.1:7394/ingest/19b6b482-2a3a-42dc-852e-bc41c46f6a24", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cdaaf3" },
    body: line,
  }).catch(() => {});
}
