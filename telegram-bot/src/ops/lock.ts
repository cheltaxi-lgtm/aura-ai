import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { botConfig } from "../config.js";

export function acquirePollingLock(): boolean {
  const path = botConfig.lockPath;
  if (existsSync(path)) {
    try {
      const prev = Number(readFileSync(path, "utf8").trim());
      if (prev && prev !== process.pid) {
        try {
          process.kill(prev, 0);
          console.error(`[lock] another instance holds lock pid=${prev}`);
          return false;
        } catch {
          // stale
        }
      }
    } catch {
      // rewrite
    }
  }
  writeFileSync(path, String(process.pid), "utf8");
  return true;
}

export function releasePollingLock(): void {
  try {
    if (existsSync(botConfig.lockPath)) unlinkSync(botConfig.lockPath);
  } catch {
    // ignore
  }
}
