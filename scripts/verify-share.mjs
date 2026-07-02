/**

 * Share module unit checks (no DB).

 * Run: npm run test:share

 */

import assert from "node:assert/strict";

import {

  buildShareHook,

  buildShareLinkMessage,

  buildSharePageUrl,

  buildSharePreviewLines,

} from "../src/lib/share/build-url.ts";

import {

  extractShareSourceMeta,

  stripLegacyPrivateFields,

  toPublicPayload,

  toSharePublicApiResponse,

} from "../src/lib/share/public-payload.ts";

import { ogKindLabel, resolveOgVisualKind } from "../src/lib/share/og-template.ts";

import { sanitizeShareBody } from "../src/lib/share/sanitize.ts";

import { shareInputToPayload } from "../src/lib/share-reading.ts";



function ok(name, fn) {

  try {

    fn();

    console.log(`  PASS  ${name}`);

    return true;

  } catch (err) {

    console.error(`  FAIL  ${name}`);

    console.error(err);

    return false;

  }

}



let passed = 0;

let failed = 0;



function test(name, fn) {

  if (ok(name, fn)) passed++;

  else failed++;

}



test("buildSharePageUrl copy has no UTM", () => {

  const url = buildSharePageUrl("abc123");

  assert.equal(url.includes("utm_"), false);

});



test("buildSharePageUrl channel adds UTM", () => {

  const url = buildSharePageUrl("abc123", "telegram");

  assert.match(url, /utm_source=share/);

  assert.match(url, /utm_medium=telegram/);

});



test("buildShareHook excludes full reading body", () => {

  const hook = buildShareHook("Нумерология", "Эвелина");

  assert.match(hook, /Посмотри мой расклад/);

  assert.match(hook, /Полный текст/);

  assert.match(hook, /Мастер: Эвелина/);

  assert.equal(hook.includes("совместимость"), false);

  assert.equal(hook.includes("\n\n\n"), false);

});



test("buildSharePreviewLines has no duplicate master block", () => {

  const lines = buildSharePreviewLines("Нумерология", "Эвелина");

  assert.equal(lines.filter((l) => l.startsWith("Мастер:")).length, 1);

  assert.equal(lines.length, 4);

});



test("buildShareLinkMessage uses clean URL without UTM", () => {

  const msg = buildShareLinkMessage("Таро", "https://zovus.ru/share/abc", "Вероника");

  assert.match(msg, /https:\/\/zovus\.ru\/share\/abc/);

  assert.equal(msg.includes("utm_"), false);

});



test("toPublicPayload strips private fields", () => {

  const pub = toPublicPayload({

    kind: "session",

    title: "Нумерология",

    excerpt: "Полный текст расклада",

    sessionId: "00000000-0000-0000-0000-000000000001",

    historyId: "00000000-0000-0000-0000-000000000002",

    sourceType: "session",

    sourceId: "00000000-0000-0000-0000-000000000001",

  });

  assert.equal("sessionId" in pub, false);

  assert.equal("historyId" in pub, false);

  assert.equal(pub.excerpt, "Полный текст расклада");

});



test("toSharePublicApiResponse strips legacy private fields", () => {

  const res = toSharePublicApiResponse({

    token: "abc",

    kind: "session",

    payload: {

      kind: "session",

      title: "Нумерология",

      excerpt: "Текст",

      sessionId: "secret",

    },

    viewCount: 1,

    createdAt: "2026-01-01T00:00:00Z",

    expiresAt: null,

  });

  assert.equal("sessionId" in res.payload, false);

  assert.equal(res.token, "abc");

});



test("stripLegacyPrivateFields cleans old snapshots", () => {

  const pub = stripLegacyPrivateFields({

    kind: "session",

    title: "Нумерология",

    excerpt: "Обрезанный текст",

    sessionId: "secret",

  });

  assert.equal("sessionId" in pub, false);

  assert.equal(pub.legacySnapshot, undefined);

});



test("extractShareSourceMeta maps session and history", () => {

  const sessionMeta = extractShareSourceMeta({

    kind: "session",

    title: "T",

    sessionId: "s1",

  });

  assert.equal(sessionMeta.sourceType, "session");

  assert.equal(sessionMeta.sessionId, "s1");



  const historyMeta = extractShareSourceMeta({

    kind: "reading",

    title: "T",

    historyId: "h1",

  });

  assert.equal(historyMeta.sourceType, "history");

  assert.equal(historyMeta.historyId, "h1");

});



test("shareInputToPayload passes historyId for server rehydrate", () => {

  const payload = shareInputToPayload(

    {

      title: "Нумерология",

      text: "Клиентский excerpt",

      historyId: "hist-1",

      masterKey: "numerolog",

    },

    "reading"

  );

  assert.equal(payload.historyId, "hist-1");

  assert.equal(payload.sourceType, "history");

});



test("resolveOgVisualKind detects numerology and runes", () => {

  assert.equal(

    resolveOgVisualKind({ kind: "session", title: "Нумерология", excerpt: "", masterKey: "numerolog" }, "session"),

    "numerology"

  );

  assert.equal(

    resolveOgVisualKind({ kind: "reading", title: "Руны", excerpt: "", masterKey: "ragnar", deckSystem: "runes/elder" }, "reading"),

    "runes"

  );

  assert.equal(ogKindLabel("numerology"), "Нумерология");

  assert.equal(ogKindLabel("runes"), "Руны");

});



test("sanitizeShareBody cuts at sentence boundary", () => {

  const long = `${"А".repeat(99990)}. Финальное предложение которое не должно попасть.`;

  const out = sanitizeShareBody(long);

  assert.ok(out.endsWith("…"));

  assert.ok(!out.endsWith("А…"));

});



console.log("");

if (failed > 0) {

  console.error(`verify-share: ${failed} failed, ${passed} passed`);

  process.exit(1);

}

console.log(`verify-share: all ${passed} checks passed`);


