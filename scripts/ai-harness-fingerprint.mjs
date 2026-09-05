import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generated = /^(?:\.cursor\/harness-state\.json|docs\/yandex-audit\/|test-results\/|playwright-report\/|tmp\/)/;

/** Bind evidence to HEAD and every changed source/config/document, including untracked files. */
export function workspaceFingerprint(root = ROOT) {
  const git = (args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
    if (result.status !== 0) throw new Error("Cannot fingerprint the working tree");
    return result.stdout;
  };
  const head = git(["rev-parse", "HEAD"]).trim();
  const files = [...new Set([
    ...git(["diff", "--name-only", "-z", "HEAD"]).split("\0"),
    ...git(["ls-files", "--others", "--exclude-standard", "-z"]).split("\0"),
  ])].filter(f => f && !generated.test(f)).sort();
  const hash = createHash("sha256").update(head).update("\0");
  for (const file of files) {
    hash.update(file).update("\0");
    const absolute = path.join(root, file);
    try {
      const stat = fs.lstatSync(absolute);
      hash.update(stat.isSymbolicLink() ? fs.readlinkSync(absolute) : fs.readFileSync(absolute));
      hash.update("\0");
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      hash.update("deleted\0");
    }
  }
  return hash.digest("hex");
}

export function requiredReviewIds(files = [], productionRequired = false) {
  const ids = new Set(["code"]);
  const names = files.map(file => String(file).replace(/\\/g, "/"));
  if (names.some(f => /^(telegram-bot\/|src\/app\/api\/)|auth|billing|receipt|payment|storage|delete-account|user-deletion/i.test(f))) ids.add("security");
  if (names.some(f => /\.(tsx|css|scss)$|telegram-bot\/src\/(render|copy|keyboards)\//.test(f))) ids.add("visual");
  if (names.some(f => /(?:engine|golden|calculat|calculator|ephemeris)/i.test(f))) ids.add("calc");
  if (productionRequired || names.some(f => /^(hosting\/|scripts\/deploy)/.test(f))) ids.add("production");
  return [...ids];
}
