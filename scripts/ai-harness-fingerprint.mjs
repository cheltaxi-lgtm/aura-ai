import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generated = /^(?:\.cursor\/harness-state\.json|docs\/yandex-audit\/|test-results\/|playwright-report\/|tmp\/)/;
// Computation helpers and input normalization affect chart results even when
// their filenames do not contain "engine" or "calculate".
const calculationPaths = [
  /(?:engine|golden|calculat|ephemeris)/i,
  /^src\/lib\/numerology\/(?:destiny-matrix(?:-[^/]+)?|matrix-(?:reducers|compatibility|calendar|channels|arcana-map|period|year-forecast|natal-bridge|zones)|constants|compatibility|forecast|favorable-dates|profile|pythagoras-square|index)\./i,
  /^src\/lib\/natal\/(?:aspects|chart-angle|composite|compute|houses|math|midpoints|patterns|sky|synastry|time|timing|transits|vedic|western|geocode|geonames|cities-fallback|celestine\/adapter|types|index)\./i,
  /^src\/lib\/human-design\/(?:connection|constants|chart-extras|transits-week|fingerprint|types|index)\./i,
];

/** Documentation and generated artifacts do not select product checks or reviews. */
export function requiresVerification(file) {
  const name = String(file).replace(/\\/g, "/");
  if (generated.test(name) || /^(?:\.pnpm-store|node_modules|output)\//.test(name)) return false;
  if (/\.(?:md|mdc|rst)$/i.test(name)) return false;
  if (/^docs\/.*\.txt$|(?:^|\/)(?:README|LICENSE|CHANGELOG|CONTRIBUTING)\.txt$/i.test(name)) return false;
  if (/^(?:\.agents|\.cursor)\/skills\/[^/]+\/agents\/openai\.ya?ml$|^\.codex\/agents\/[^/]+\.toml$/i.test(name)) return false;
  return Boolean(name);
}

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
  const names = files.filter(requiresVerification).map(file => String(file).replace(/\\/g, "/"));
  const ids = new Set(names.length ? ["code"] : []);
  if (names.some(f => /^(telegram-bot\/|src\/app\/api\/)|auth|billing|receipt|payment|storage|delete-account|user-deletion/i.test(f))) ids.add("security");
  if (names.some(f => /\.(tsx|css|scss)$|telegram-bot\/src\/(render|copy|keyboards)\//.test(f))) ids.add("visual");
  if (names.some(file => calculationPaths.some(pattern => pattern.test(file)))) ids.add("calc");
  if (productionRequired) ids.add("production");
  return [...ids];
}
