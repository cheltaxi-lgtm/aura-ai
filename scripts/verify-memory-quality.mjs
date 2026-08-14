#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  process.execPath,
  [path.join(root, "node_modules/tsx/dist/cli.mjs"), "tests/memory-quality/run.ts"],
  { cwd: root, stdio: "inherit" }
);
process.exit(typeof result.status === "number" ? result.status : 1);
