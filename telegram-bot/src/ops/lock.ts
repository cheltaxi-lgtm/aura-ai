import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { botConfig } from "../config.js";

let lockDb: DatabaseSync | undefined;

/** SQLite's OS-backed exclusive lock is released even after SIGKILL or a crash. */
export function acquirePollingLock(): boolean {
  if (lockDb) return false;
  // Respect a still-running legacy PID-file owner during upgrade, without unlink races.
  if (existsSync(botConfig.lockPath)) {
    let legacyPid: number;
    try { legacyPid = Number(readFileSync(botConfig.lockPath, "utf8").trim()); }
    catch { return false; }
    if (!Number.isSafeInteger(legacyPid) || legacyPid <= 0) return false;
    try { process.kill(legacyPid, 0); return false; }
    catch (err) { if ((err as NodeJS.ErrnoException).code !== "ESRCH") return false; }
  }
  let candidate: DatabaseSync | undefined;
  try {
    candidate = new DatabaseSync(`${botConfig.lockPath}.sqlite`);
    // Dedicated lock database, never the application's WAL database.
    candidate.exec("PRAGMA busy_timeout = 0; PRAGMA journal_mode = DELETE; BEGIN EXCLUSIVE;");
    lockDb = candidate;
    return true;
  } catch {
    try { candidate?.close(); } catch { /* preserve existing owner */ }
    console.error("[lock] polling instance already active or lock database unavailable");
    return false;
  }
}

export function releasePollingLock(): void {
  const owned = lockDb;
  lockDb = undefined;
  owned?.close();
}
