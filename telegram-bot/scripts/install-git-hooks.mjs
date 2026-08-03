/**
 * Installs a lightweight root pre-commit snippet that runs telegram-bot audit.
 * No husky/lefthook dependency.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const hooksDir = resolve(repoRoot, ".git/hooks");
const marker = "# zovus-telegram-bot-audit";

if (!existsSync(resolve(repoRoot, ".git"))) {
  console.log("[hooks] no .git at repo root — skip");
  process.exit(0);
}

mkdirSync(hooksDir, { recursive: true });
const hookPath = resolve(hooksDir, "pre-commit");
const snippet = `${marker}
# Run bot offline audit when telegram-bot/ changes are staged
if git diff --cached --name-only | grep -q '^telegram-bot/'; then
  (cd telegram-bot && npm run audit) || exit 1
fi
`;

let existing = "";
if (existsSync(hookPath)) {
  existing = readFileSync(hookPath, "utf8");
  if (existing.includes(marker)) {
    console.log("[hooks] pre-commit already includes bot audit");
    process.exit(0);
  }
}

const body = existing
  ? `${existing.trimEnd()}\n\n${snippet}`
  : `#!/bin/sh\n${snippet}`;

writeFileSync(hookPath, body, "utf8");
try {
  chmodSync(hookPath, 0o755);
} catch {
  // Windows may ignore mode
}
console.log("[hooks] installed bot audit into .git/hooks/pre-commit");
