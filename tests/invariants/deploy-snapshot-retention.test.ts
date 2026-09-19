import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const script = path.join(process.cwd(), "hosting/prune-deploy-snapshots.sh");
const shellPath = (value: string) => {
  if (process.platform !== "win32") return value;
  return value.replaceAll("\\", "/").replace(/^([A-Za-z]):\//, (_, drive: string) => `/${drive.toLowerCase()}/`);
};

function runRetention(root: string, ...args: string[]) {
  return execFileSync(
    bash,
    [shellPath(script), shellPath(root), ...args],
    { encoding: "utf8" }
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("deploy snapshot retention", () => {
  it("defaults to a dry run and selects only snapshots older than the retained three", () => {
    const root = mkdtempSync(path.join(tmpdir(), "zovus-snapshot-retention-"));
    roots.push(root);
    for (let index = 1; index <= 5; index += 1) {
      const dir = path.join(root, `release-2026090${index}T000000Z-test`);
      mkdirSync(dir);
      const timestamp = new Date(`2026-09-0${index}T00:00:00Z`);
      utimesSync(dir, timestamp, timestamp);
    }

    const dryRun = runRetention(root);
    expect(dryRun.match(/Would remove old deploy snapshot/g)).toHaveLength(2);
    expect(readdirSync(root)).toHaveLength(5);

    expect(() => runRetention(root, "3", "--apply")).toThrow();
    expect(readdirSync(root)).toHaveLength(5);
  });

  it("refuses unsafe values, modes, missing roots and destructive non-production roots", () => {
    const root = mkdtempSync(path.join(tmpdir(), "zovus-snapshot-retention-"));
    roots.push(root);
    expect(() => runRetention(root, "1", "--dry-run")).toThrow();
    expect(() => runRetention(root, "3", "--unknown")).toThrow();
    expect(() => runRetention(path.join(root, "missing"), "3", "--dry-run")).toThrow();
    expect(() => runRetention(root, "3", "--apply")).toThrow();
    expect(readFileSync(script, "utf8")).toContain(
      '"$ROOT" != "/opt/aura-ai-deploy-snapshots"'
    );
  });
});
