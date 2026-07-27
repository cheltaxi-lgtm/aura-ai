/**
 * Static hygiene guard for the LLM prompt sources.
 *
 * Catches the defect classes found in the prompt audit:
 * 1. Mixed Cyrillic/Latin inside one word ("Кumar", "зodiac", "Юпiter", "Фehu").
 *    These teach the model to do exactly what GLOBAL_MASTER_RULES forbids.
 * 2. Latin example text inside the Russian style examples.
 * 3. A phrase banned by CARD_GROUNDED_READING_RULES being taught as a master's signature.
 * 4. SPREAD_TRUTH_RULES injected twice into one assembled prompt.
 * 5. A system prompt reaching the model without wrapSystemPrompt (photo JSON path).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HONESTY_POLICY } from "@/lib/prompt-policy";
import { buildSystemPrompt } from "@/lib/prompts";
import {
  CARD_GROUNDED_READING_RULES,
  CONTEXT_RULES,
  DARK_TOPICS_POLICY,
} from "@/lib/prompts/format";
import { SPREAD_TRUTH_RULES } from "@/lib/prompts/gender-context";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function section(name: string) {
  console.log(`\n== ${name} ==`);
}

function listPromptSources(): string[] {
  const dirs = ["src/lib/prompts", "src/lib/prompts/masters"];
  const files: string[] = ["src/lib/prompt-policy.ts", "src/lib/guest-triplet-teaser-prompt.ts"];
  for (const dir of dirs) {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".ts")) files.push(`${dir}/${entry.name}`);
    }
  }
  return [...new Set(files)];
}

/**
 * Prompt text lives in template literals and quoted strings; regexes live in bare
 * code. Scanning only literals keeps character classes like /[a-zа-я]/ out of the way.
 */
function extractLiterals(source: string): string[] {
  const out: string[] = [];
  const patterns = [/`(?:[^`\\]|\\[\s\S])*`/g, /"(?:[^"\\\n]|\\.)*"/g];
  for (const re of patterns) {
    for (const match of source.matchAll(re)) out.push(match[0]);
  }
  return out;
}

const CYRILLIC = /[А-Яа-яЁё]/;
const LATIN = /[A-Za-z]/;

/** Letter runs mixing both scripts, ignoring escape sequences like \n or \b. */
function findMixedScriptWords(literal: string): string[] {
  const found: string[] = [];
  for (const match of literal.matchAll(/[A-Za-zА-Яа-яЁё]+/g)) {
    const word = match[0];
    if (!CYRILLIC.test(word) || !LATIN.test(word)) continue;
    const prev = match.index > 0 ? literal[match.index - 1] : "";
    if (prev === "\\") continue;
    found.push(word);
  }
  return found;
}

section("0. detector self-test");
{
  const mustCatch: Record<string, string> = {
    '"Гуру Шри Радж Кumar"': "Кumar",
    "`страх, зodiac, пол`": "зodiac",
    "`Юпiter, Shukra — ресурс есть`": "Юпiter",
    "`Фehu, Uruz, Thurisaz`": "Фehu",
  };
  for (const [literal, expected] of Object.entries(mustCatch)) {
    assert.deepEqual(
      findMixedScriptWords(literal),
      [expected],
      `detector missed ${literal}`
    );
  }
  // Escape sequences and clean text must not trip it.
  for (const clean of ["`\\bжена\\b`", "`\\nАКТУАЛЬНАЯ ТЕМА`", "`Fehu перевёрнута`", '"Гуру Шри Радж Кумар"']) {
    assert.deepEqual(findMixedScriptWords(clean), [], `false positive on ${clean}`);
  }
  console.log(`ok — detector catches ${Object.keys(mustCatch).length} known defects, no false positives`);
}

section("1. no mixed Cyrillic/Latin words in prompt text");
{
  const violations: string[] = [];
  let scannedChars = 0;
  for (const rel of listPromptSources()) {
    const source = readSrc(rel);
    for (const literal of extractLiterals(source)) {
      scannedChars += literal.length;
      for (const word of findMixedScriptWords(literal)) {
        violations.push(`${rel}: «${word}»`);
      }
    }
  }
  // Guard against the scanner silently matching nothing (e.g. literal regex drift).
  assert.ok(
    scannedChars > 50_000,
    `prompt literal coverage too low (${scannedChars} chars) — extractLiterals is probably broken`
  );
  assert.deepEqual(
    violations,
    [],
    `Mixed-script words in prompt text (rewrite in one script):\n${violations.join("\n")}`
  );
  console.log(`ok — every prompt word is single-script (${scannedChars} chars scanned)`);
}

section("2. style examples stay Russian");
{
  const format = readSrc("src/lib/prompts/format.ts");
  // The "Хорошо: ..." lines are what the model imitates; they must not be English.
  const goodExamples = [...format.matchAll(/^(?:Хорошо|А) «([^»]+)»/gm)].map((m) => m[1]);
  assert.ok(goodExamples.length > 0, "expected to find «Хорошо/А» style examples in format.ts");
  const latinExamples = goodExamples.filter((ex) => LATIN.test(ex) && !CYRILLIC.test(ex));
  assert.deepEqual(
    latinExamples,
    [],
    `Style examples written in Latin script:\n${latinExamples.join("\n")}`
  );
  console.log(`ok — ${goodExamples.length} positive examples, none Latin-only`);
}

section("3. banned phrases are not taught as master signatures");
{
  const grounded = readSrc("src/lib/prompts/format.ts");
  const banned = ["карты шепчут", "вселенная посылает"];
  for (const phrase of banned) {
    assert.ok(
      grounded.toLowerCase().includes(phrase),
      `expected «${phrase}» to still be listed as banned in format.ts`
    );
  }
  const violations: string[] = [];
  for (const entry of fs.readdirSync(path.join(root, "src/lib/prompts/masters"))) {
    if (!entry.endsWith(".ts")) continue;
    const source = readSrc(`src/lib/prompts/masters/${entry}`).toLowerCase();
    for (const phrase of banned) {
      if (source.includes(phrase)) violations.push(`masters/${entry}: «${phrase}»`);
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Persona teaches a phrase that CARD_GROUNDED_READING_RULES bans:\n${violations.join("\n")}`
  );
  console.log(`ok — ${banned.length} banned phrases absent from all personas`);
}

section("4. SPREAD_TRUTH_RULES injected exactly once");
{
  const policy = readSrc("src/lib/prompt-policy.ts");
  const assemble = readSrc("src/lib/prompts/index.ts");
  assert.ok(
    /SPREAD_TRUTH_RULES/.test(policy),
    "wrapSystemPrompt must keep injecting SPREAD_TRUTH_RULES"
  );
  const inParts = assemble
    .split("\n")
    .filter((line) => line.includes("SPREAD_TRUTH_RULES") && !line.trimStart().startsWith("//"));
  assert.deepEqual(
    inParts,
    [],
    `buildSystemPrompt must not re-add SPREAD_TRUTH_RULES (already in wrapSystemPrompt):\n${inParts.join("\n")}`
  );
  console.log("ok — single injection via wrapSystemPrompt");
}

section("5. every photo-reading path wraps its system prompt");
{
  const stream = readSrc("src/lib/photo-reading-stream.ts");
  assert.ok(
    /wrapSystemPrompt/.test(stream),
    "createPhotoInterpretationJson must wrap its system prompt — the async/mobile path otherwise skips HONESTY_POLICY and DARK_TOPICS_POLICY"
  );
  const rawSystemMessage = /content:\s*params\.systemPrompt/.test(stream);
  assert.ok(
    !rawSystemMessage,
    "photo-reading-stream.ts sends params.systemPrompt unwrapped to the model"
  );
  console.log("ok — JSON and stream paths both wrapped");
}

section("6. assembled prompt contains each rule block exactly once");
{
  const user = {
    name: "Юлия",
    gender: "female",
    zodiac: "Дева",
    birthDate: "1990-09-01",
    cards: [
      { name: "Башня", meaning: "разрушение старого" },
      { name: "Семёрка Мечей", meaning: "обман, скрытность" },
      { name: "Звезда", meaning: "надежда, свет" },
    ],
    isPaid: true,
  };

  const blocks: Record<string, string> = {
    SPREAD_TRUTH_RULES,
    HONESTY_POLICY,
    DARK_TOPICS_POLICY,
    CARD_GROUNDED_READING_RULES,
    CONTEXT_RULES,
  };

  for (const character of ["veronika", "ragnar", "agafya", "shri-raj", "numerolog"] as const) {
    const base = buildSystemPrompt(character, user, {
      mode: "reading",
      intention: "love",
      spreadId: "past-present-future",
    });
    // Mirrors wrapSystemPrompt composition without needing the settings DB.
    const assembled = [SPREAD_TRUTH_RULES, HONESTY_POLICY, DARK_TOPICS_POLICY, base].join("\n\n");
    for (const [name, block] of Object.entries(blocks)) {
      const hits = assembled.split(block.trim()).length - 1;
      assert.equal(
        hits,
        1,
        `${character}: ${name} appears ${hits}x in the assembled prompt (expected exactly 1)`
      );
    }
    console.log(`ok — ${character}: ${assembled.length} chars, no duplicated rule blocks`);
  }
}

console.log("\nprompt hygiene: all checks passed");
