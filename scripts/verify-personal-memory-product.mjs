import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFile(resolve(root, path), "utf8");

const [
  page,
  sitemap,
  about,
  faq,
  privacy,
  templates,
  send,
  ritualPrompt,
  natalLens,
  numerologyRunner,
  chatPrompt,
] = await Promise.all([
  read("src/app/about/personal-memory/page.tsx"),
  read("src/app/sitemap.ts"),
  read("src/app/about/page.tsx"),
  read("src/app/faq/page.tsx"),
  read("src/app/(legal)/privacy/page.tsx"),
  read("src/lib/email/templates.ts"),
  read("src/lib/email/send.ts"),
  read("src/lib/ritual-prompt.ts"),
  read("src/lib/natal/personalization-lens.ts"),
  read("src/lib/services/numerology-tool-runner.ts"),
  read("src/lib/prompts/index.ts"),
]);

assert(!/(^|[^\p{L}])ИИ([^\p{L}]|$)/u.test(page), "public memory page must not use the term ИИ");
assert(page.includes('"@type": "FAQPage"'), "memory page must expose FAQ structured data");
assert(sitemap.includes('"/about/personal-memory"'), "memory page must be in sitemap");
assert(about.includes('href="/about/personal-memory"'), "about hub must link memory page");
assert(faq.includes('href="/about/personal-memory"'), "FAQ must link memory page");

for (const phrase of ["черновики", "Свежий сеанс", "тихий режим"]) {
  assert(privacy.toLowerCase().includes(phrase.toLowerCase()), `privacy must explain ${phrase}`);
}
assert(
  privacy.includes("не заявляем безусловный запрет на обучение внешних моделей"),
  "privacy must not overclaim external model training policy"
);

for (const name of ["memoryChoiceEnabledEmailHtml", "memoryChoiceDisabledEmailHtml"]) {
  assert(templates.includes(`function ${name}`), `missing ${name}`);
}
assert(send.includes("sendMemoryChoiceEmail"), "missing memory choice send helper");
assert(send.includes("preferences route must call this"), "integration hook must stay explicit");

for (const [label, source] of [
  ["ritual", ritualPrompt],
  ["natal", natalLens],
  ["numerology", numerologyRunner],
  ["chat follow-up", chatPrompt],
]) {
  assert(/1[–-]2/.test(source), `${label} must cap memory anchors at 1–2`);
  assert(/черновик/i.test(source), `${label} must reject drafts`);
}

console.log("Personal memory product assertions passed.");
