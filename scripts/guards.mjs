#!/usr/bin/env node
/**
 * Static grep-guards for Zovus P0 / change-discipline.
 * exit 1 on any error-level hit; warnings do not fail the process.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_ROOTS_REL = ["src", "telegram-bot/src"];
const SCAN_ROOTS = SCAN_ROOTS_REL.map((p) => path.join(ROOT, p)).filter((p) =>
  fs.existsSync(p)
);

/** @typedef {{ id: string; level: "error" | "warning"; message: string; pattern: RegExp; exclude?: string[]; fileFilter?: (rel: string, content: string) => boolean }} Guard */

/** Paths relative to repo root, posix-style. */
const EXCLUDE_DEFAULT = [
  // Legitimate UI cache / resume orchestration — not billing authority.
  "src/lib/guest-resume-ui-cache.ts",
  "src/lib/guest-triplet-resume.ts",
  "src/lib/guest-resume-cookie.ts",
  "src/lib/guest-triplet-receipt-shared.ts",
  "src/lib/guest-triplet-receipt.ts",
  // Client affordance helpers that read balance for display only.
  "src/lib/rune-afford-client.ts",
  "src/lib/useRuneConfig.ts",
];

/** Deck data / registry — server-provided sizes live here by design. */
const DECK_DATA_EXCLUDES = [
  "src/lib/decks/",
  "src/data/",
  "src/lib/spreads/registry.ts",
  "src/lib/spreads/types.ts",
  "src/lib/tarot.ts",
  "src/lib/seo/rune-meanings.ts",
  "telegram-bot/src/domain/deck/",
  "telegram-bot/assets/",
  "scripts/migrations/",
];

const USE_CLIENT_RE = /^['"]use client['"]\s*;?/m;

/** @type {Guard[]} */
const GUARDS = [
  {
    id: "G1",
    level: "error",
    message:
      "Client entitlement flag in storage — free/paid must be server-authoritative (P0).",
    pattern:
      /(?:localStorage|sessionStorage)\s*\.\s*(?:getItem|setItem|removeItem)\s*\(\s*['"`][^'"`]*(?:isFree|billingExempt|entitlement|guestResume|premium|paid|balance)[^'"`]*['"`]/i,
    exclude: EXCLUDE_DEFAULT,
  },
  {
    id: "G2",
    level: "error",
    message:
      "Auth/receipt token in client storage — Capacitor cookie-loss must not use token-only localStorage fallback (P0).",
    pattern:
      /(?:localStorage|sessionStorage)\s*\.\s*(?:getItem|setItem|removeItem)\s*\(\s*['"`][^'"`]*(?:receipt|session_token|claim|jwt|auth_token)[^'"`]*['"`]/i,
    exclude: [...EXCLUDE_DEFAULT, "src/lib/guest-resume-ui-cache.ts"],
  },
  {
    id: "G3",
    level: "error",
    message:
      "Hardcoded deck size / pick count — deck/pick counts must be server-provided (change discipline).",
    // Assignments/props on deck-ish names (incl. 3). Bare .slice(0,N)/Array(N)/.length===N
    // only for 78|36|24 — plain .slice(0,24) is ubiquitous for hex/id truncation (not decks).
    pattern: new RegExp(
      [
        String.raw`\b(?:DECK_SIZE|TAROT_DECK_SIZE|CARD_COUNT|deckSize|deckLength|fullDeckSize|pickCount|cardCount)\s*=\s*(?:78|36|24|3)\b`,
        String.raw`\b(?:const|let|var)\s+\w*(?:[Dd]eckSize|[Dd]eckLength|[Cc]ardCount|[Pp]ickCount)\w*\s*=\s*(?:78|36|24|3)\b`,
        // 24 omitted from bare .slice — too many hex/id truncations; use named deckSize=24 instead.
        String.raw`(?:\.slice\s*\(\s*0\s*,\s*(?:78|36)\s*\)|Array\s*\(\s*(?:78|36|24)\s*\)|new\s+Array\s*\(\s*(?:78|36|24)\s*\)|\.length\s*===\s*(?:78|36|24)\b)`,
        // object literal fields only (avoid ternary `.cardCount : 3`)
        String.raw`(?:^|[,{]\s*)(?:deckSize|deckLength|cardCount|pickCount|deckCount|fullDeck)\s*:\s*(?:78|36|24|3)\b`,
      ].join("|")
    ),
    exclude: [
      ...DECK_DATA_EXCLUDES,
      // Product contract: landing guest triplet is always 3 cards (server validates length === 3 too).
      "src/components/GuestTripletDraw.tsx",
      // Default param for position-label helper when spread metadata absent — not a catalog size.
      "src/lib/prompts/index.ts",
    ],
    fileFilter: (rel) =>
      (rel.endsWith(".ts") ||
        rel.endsWith(".tsx") ||
        rel.endsWith(".js") ||
        rel.endsWith(".jsx")) &&
      !rel.includes("/tests/") &&
      !rel.includes("__tests__") &&
      !rel.includes("generate-") &&
      !rel.includes("verify-deck"),
  },
  {
    id: "G4",
    level: "error",
    message:
      "Timezone offset integer / getTimezoneOffset in business logic — use IANA strings.",
    pattern:
      /\bgetTimezoneOffset\s*\(|\b(?:tzOffset|timezoneOffset|offsetMinutes|offsetHours)\s*[:=]\s*-?\d+/,
    exclude: [],
  },
  {
    id: "G5",
    level: "warning",
    message:
      "Animation/transition on non-transform/opacity properties — prefer transform/opacity + prefers-reduced-motion.",
    pattern:
      /(?:transition|animation)\s*:[^;{]*(?:\bwidth\b|\bheight\b|\btop\b|\bleft\b|\bmargin\b|\bbox-shadow\b|\bfilter\b)/i,
    exclude: [],
  },
  {
    id: "G6",
    level: "error",
    message:
      "process.env without NEXT_PUBLIC_ in a 'use client' file — secrets must not ship to the browser.",
    pattern: /process\.env\.(?!NEXT_PUBLIC_)[A-Z0-9_]+/,
    exclude: [],
    fileFilter: (_rel, content) => USE_CLIENT_RE.test(content),
  },
  {
    id: "G7",
    level: "error",
    message:
      "Server billing/auth module imported from 'use client' file — keep entitlement server-side.",
    pattern:
      /from\s+['"]@\/lib\/(?:services\/billing-service|require-auth|rune-service|guest-resume-billing|guest-triplet-receipt-db)['"]/,
    exclude: [],
    fileFilter: (_rel, content) => USE_CLIENT_RE.test(content),
  },
  {
    id: "G8",
    level: "error",
    message:
      "Direct SQL / DB pool access in client component — database must stay server-only.",
    pattern:
      /\b(?:getPool|withTransaction)\s*\(|\bfrom\s+['"]@\/lib\/db['"]|\bfrom\s+['"]pg['"]|\bnew\s+Pool\s*\(/,
    exclude: [],
    fileFilter: (rel, content) => {
      if (rel.startsWith("src/components/")) return true;
      return USE_CLIENT_RE.test(content);
    },
  },
];

const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css"]);

function walkDir(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".next" || ent.name === "dist")
      continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkDir(full, out);
    else if (EXT.has(path.extname(ent.name))) out.push(full);
  }
  return out;
}

function toRel(abs) {
  return path.relative(ROOT, abs).split(path.sep).join("/");
}

function isExcluded(rel, exclude = []) {
  return exclude.some(
    (ex) =>
      rel === ex ||
      rel.startsWith(ex.endsWith("/") ? ex : `${ex}/`) ||
      rel.startsWith(ex)
  );
}

function scanFile(abs, guard) {
  const rel = toRel(abs);
  if (isExcluded(rel, guard.exclude)) return [];
  let content;
  try {
    content = fs.readFileSync(abs, "utf8");
  } catch {
    return [];
  }
  if (guard.fileFilter && !guard.fileFilter(rel, content)) return [];

  const hits = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (
      line.includes("guards-ignore") ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("<!--")
    ) {
      continue;
    }
    guard.pattern.lastIndex = 0;
    if (guard.pattern.test(line)) {
      hits.push({ rel, line: i + 1, text: trimmed.slice(0, 160), guard });
    }
  }
  return hits;
}

function main() {
  console.log("Scanning directories:");
  for (const rel of SCAN_ROOTS_REL) {
    const abs = path.join(ROOT, rel);
    console.log(`  - ${rel}${fs.existsSync(abs) ? "" : " (missing, skipped)"}`);
  }

  const files = SCAN_ROOTS.flatMap((r) => walkDir(r));
  /** @type {ReturnType<typeof scanFile>} */
  let all = [];
  for (const guard of GUARDS) {
    for (const f of files) {
      all = all.concat(scanFile(f, guard));
    }
  }

  const errors = all.filter((h) => h.guard.level === "error");
  const warnings = all.filter((h) => h.guard.level === "warning");

  /** @type {Record<string, { error: number; warning: number; samples: string[] }>} */
  const byGuard = {};
  for (const g of GUARDS) byGuard[g.id] = { error: 0, warning: 0, samples: [] };
  for (const h of all) {
    byGuard[h.guard.id][h.guard.level] += 1;
    if (byGuard[h.guard.id].samples.length < 5) {
      byGuard[h.guard.id].samples.push(`${h.rel}:${h.line}`);
    }
  }

  for (const h of all) {
    const tag = h.guard.level === "error" ? "ERROR" : "WARN ";
    console.log(`${tag} [${h.guard.id}] ${h.rel}:${h.line}`);
    console.log(`       ${h.guard.message}`);
    console.log(`       ${h.text}`);
  }

  console.log("\n--- summary ---");
  console.log("| guard | errors | warnings |");
  console.log("|-------|--------|----------|");
  for (const g of GUARDS) {
    const s = byGuard[g.id];
    console.log(`| ${g.id} | ${s.error} | ${s.warning} |`);
  }
  for (const g of GUARDS) {
    const s = byGuard[g.id];
    console.log(
      `${g.id} (${g.level}): errors=${s.error} warnings=${s.warning}` +
        (s.samples.length ? ` e.g. ${s.samples.join(", ")}` : " (clean)")
    );
  }
  console.log(`total errors=${errors.length} warnings=${warnings.length}`);

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main();
