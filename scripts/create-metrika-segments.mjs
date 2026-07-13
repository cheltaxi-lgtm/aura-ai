#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(join(__dir, "..", ".env.local"));

const token = process.env.YANDEX_METRIKA_OAUTH_TOKEN;
const counterId = 110138367;

if (!token) {
  console.error("Set YANDEX_METRIKA_OAUTH_TOKEN");
  process.exit(1);
}

async function api(path, options = {}) {
  const res = await fetch(`https://api-metrika.yandex.net${path}`, {
    ...options,
    headers: {
      Authorization: `OAuth ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const SEGMENTS = [
  {
    name: "Zovus — Гость",
    expression:
      "NONE(ym:s:startURL=@'/admin') AND NONE(ym:s:startURL=@'/cabinet') AND NONE(ym:s:startURL=@'/expert')",
  },
  {
    name: "Zovus — Mobile guest",
    expression:
      "ym:s:deviceCategory=='mobile' AND NONE(ym:s:startURL=@'/admin') AND NONE(ym:s:startURL=@'/cabinet') AND NONE(ym:s:startURL=@'/expert')",
  },
  {
    name: "Zovus — Исключить QA (app=1)",
    expression: "ym:s:startURL=@'app=1'",
  },
];

const existing = await api(`/management/v1/counter/${counterId}/segments`);
const byName = new Map((existing.segments ?? []).map((s) => [s.name, s]));

for (const seg of SEGMENTS) {
  if (byName.has(seg.name)) {
    console.log(`ok ${seg.name} #${byName.get(seg.name).segment_id ?? byName.get(seg.name).id}`);
    continue;
  }
  try {
    const result = await api(`/management/v1/counter/${counterId}/segments`, {
      method: "POST",
      body: JSON.stringify({ segment: seg }),
    });
    const created = result.segment ?? result;
    console.log(`created ${seg.name} #${created.segment_id ?? created.id}`);
  } catch (err) {
    console.warn(`fail ${seg.name}: ${err.message}`);
  }
}

const final = await api(`/management/v1/counter/${counterId}/segments`);
console.log(`\nTotal segments: ${(final.segments ?? []).length}`);
