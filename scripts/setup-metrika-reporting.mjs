#!/usr/bin/env node
/**
 * Настройка отчётности Метрики: составная воронка + сегменты (access filters).
 * Usage: node scripts/setup-metrika-reporting.mjs [--dry-run]
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");

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
const goalsDoc = JSON.parse(readFileSync(join(__dir, "metrika-goals.json"), "utf8"));
const counterId = goalsDoc.counterId;

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

function goalId(slug) {
  const g = goalsDoc.goals.find((x) => x.id === slug);
  if (!g?.metrikaGoalId) throw new Error(`Missing metrikaGoalId for ${slug}`);
  return g.metrikaGoalId;
}

function actionStep(name, eventId) {
  return {
    name,
    type: "action",
    conditions: [{ type: "exact", url: eventId }],
  };
}

const FUNNEL_NAME = "Zovus — воронка гостя";
const FUNNEL_STEPS = [
  ["1. landing_view", "landing_view"],
  ["2. guest_spread_started", "guest_spread_started"],
  ["3. guest_spread_completed", "guest_spread_completed"],
  ["4. registration_account_created", "registration_account_created"],
  ["5. first_chat_opened", "first_chat_opened"],
];

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

async function ensureCompositeFunnel(existingGoals) {
  const existing = existingGoals.find(
    (g) => g.type === "step" && (g.name === FUNNEL_NAME || g.name?.includes("воронка гостя"))
  );
  if (existing) {
    console.log(`ok funnel already exists: ${existing.name} #${existing.id}`);
    return existing.id;
  }

  const body = {
    goal: {
      name: FUNNEL_NAME,
      type: "step",
      is_retargeting: 0,
      steps: FUNNEL_STEPS.map(([name, eventId]) => actionStep(name, eventId)),
    },
  };

  if (dryRun) {
    console.log(`would create funnel: ${FUNNEL_NAME}`, JSON.stringify(body, null, 2));
    return null;
  }

  const result = await api(`/management/v1/counter/${counterId}/goals`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  console.log(`created funnel: ${FUNNEL_NAME} #${result.goal.id}`);
  return result.goal.id;
}

async function ensureAccessFilters(existing) {
  const byName = new Map((existing.access_filters ?? []).map((f) => [f.name, f]));

  for (const seg of SEGMENTS) {
    if (byName.has(seg.name)) {
      console.log(`ok segment/filter: ${seg.name} #${byName.get(seg.name).id}`);
      continue;
    }

    const body = {
      access_filter: {
        name: seg.name,
        expression: seg.expression,
      },
    };

    if (dryRun) {
      console.log(`would create filter: ${seg.name}`);
      continue;
    }

    try {
      const result = await api(`/management/v1/counter/${counterId}/access_filters`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      console.log(`created filter: ${seg.name} #${result.access_filter.id}`);
    } catch (err) {
      console.warn(`filter ${seg.name} failed: ${err.message}`);
    }
  }
}

async function main() {
  console.log(`Counter ${counterId}, dryRun=${dryRun}`);

  const goalsRes = await api(`/management/v1/counter/${counterId}/goals`);
  await ensureCompositeFunnel(goalsRes.goals ?? []);

  let filtersRes = { access_filters: [] };
  try {
    filtersRes = await api(`/management/v1/counter/${counterId}/access_filters`);
  } catch (err) {
    console.warn(`access_filters list: ${err.message}`);
  }
  await ensureAccessFilters(filtersRes);

  // Sanity: log funnel goal ids referenced
  console.log("\nFunnel step Metrika IDs:");
  for (const [, slug] of FUNNEL_STEPS) {
    console.log(`  ${slug} -> ${goalId(slug)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
