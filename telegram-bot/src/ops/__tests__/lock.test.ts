import assert from "node:assert/strict";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { acquirePollingLock, releasePollingLock } from "../lock.js";

if (process.argv[2] === "holder") {
  const acquired = acquirePollingLock();
  process.send?.(acquired ? "acquired" : "busy");
  if (!acquired) process.exit(0);
  process.on("message", () => { releasePollingLock(); process.exit(0); });
} else {
  const children: ChildProcess[] = [];
  async function start(): Promise<{ child: ChildProcess; acquired: boolean }> {
    const child = fork(fileURLToPath(import.meta.url), ["holder"], {
      execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "inherit", "ipc"],
    });
    children.push(child);
    const result = await Promise.race([
      once(child, "message").then(([message]) => message),
      once(child, "exit").then(() => { throw new Error("lock contender exited without result"); }),
    ]);
    return { child, acquired: result === "acquired" };
  }
  try {
    const contenders = await Promise.all([start(), start()]);
    assert.equal(contenders.filter(c => c.acquired).length, 1, "exactly one concurrent owner");
    const owner = contenders.find(c => c.acquired)!.child;
    const exited = once(owner, "exit");
    owner.kill("SIGKILL");
    await exited;
    const replacement = await start();
    assert(replacement.acquired, "OS releases lock automatically after owner is killed");
    const released = once(replacement.child, "exit");
    replacement.child.send("release");
    await released;
    assert(acquirePollingLock(), "normal release permits another owner");
    assert(!acquirePollingLock(), "same process cannot acquire twice");
    releasePollingLock();
    console.log("ok: OS polling lock / concurrent contenders / crash recovery / normal release");
  } finally {
    releasePollingLock();
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}
