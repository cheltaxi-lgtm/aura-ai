/**
 * Ads SEO override reader: whitelist-only hrefs, fail-open merge, ROLLBACK gate.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  mergeInternalLinks,
  normalizeOverridePath,
  parseInternalLinksJson,
  pinCanonicalToAppOrigin,
  sanitizeSchemaJson,
} from "@/modules/ads/organic/overrides";
import { buildSeoMetadata } from "@/lib/seo/metadata";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("ads seo overrides", () => {
  it("normalizes path and drops query/hash", () => {
    expect(normalizeOverridePath("/taro/?x=1")).toBe("/taro");
    expect(normalizeOverridePath("https://zovus.ru/runy/fehu")).toBe("/runy/fehu");
    expect(normalizeOverridePath("")).toBe("/");
  });

  it("parses internal_links JSON with whitelist-only hrefs", () => {
    const links = parseInternalLinksJson(
      JSON.stringify([
        { href: "/taro", label: "Таро" },
        { href: "/auth", label: "leak" },
        { href: "/cabinet", to: "/cabinet" },
        { href: "/runy/fehu", anchor: "Феху" },
        { href: "https://evil.test/phishing", label: "no" },
      ])
    );
    expect(links.map((l) => l.href).sort()).toEqual(["/runy/fehu", "/taro"]);
    expect(links.find((l) => l.href === "/runy/fehu")?.label).toBe("Феху");
  });

  it("merges internal links without dupes", () => {
    const merged = mergeInternalLinks(
      [{ href: "/taro", label: "Таро" }],
      [{ href: "/taro", label: "dup" }, { href: "/prognoz", label: "Прогноз" }]
    );
    expect(merged.map((l) => l.href)).toEqual(["/taro", "/prognoz"]);
  });

  it("sanitizes schema_json and rejects script breakouts", () => {
    expect(sanitizeSchemaJson('{"@type":"WebPage"}')).toContain("WebPage");
    expect(sanitizeSchemaJson("</script><script>alert(1)")).toBeNull();
    expect(sanitizeSchemaJson("not-json")).toBeNull();
    const unicode = '{"@type":"WebPage","name":"\\u003c/script\\u003e\\u003cscript\\u003ealert(1)"}';
    const escaped = sanitizeSchemaJson(unicode);
    expect(escaped).toBeTruthy();
    expect(escaped).not.toMatch(/<\/script/i);
    expect(escaped).toContain("\\u003c");
    const literal = sanitizeSchemaJson(JSON.stringify({ name: "</script><script>alert(1)</script>" }));
    expect(literal).toBeTruthy();
    expect(literal).not.toMatch(/<\/script/i);
  });

  it("pins canonical to app origin and drops off-site hosts", () => {
    expect(pinCanonicalToAppOrigin("/taro", "https://zovus.ru")).toBe("https://zovus.ru/taro");
    expect(pinCanonicalToAppOrigin("https://zovus.ru/runy", "https://zovus.ru")).toBe(
      "https://zovus.ru/runy"
    );
    expect(pinCanonicalToAppOrigin("https://evil.test/taro", "https://zovus.ru")).toBeNull();
    expect(pinCanonicalToAppOrigin("javascript:alert(1)", "https://zovus.ru")).toBeNull();
  });

  it("reader SELECT is applied=TRUE (ROLLBACK unpublishes)", () => {
    const reader = read("src/modules/ads/organic/overrides.ts");
    expect(reader).toMatch(/applied = TRUE/);
    const rules = read("src/modules/ads/organic/seo-rules.ts");
    expect(rules).toMatch(/SET applied = FALSE/);
    expect(rules).toMatch(/status = 'PROTECT'/);
  });

  it("whitelist hubs merge overrides in generateMetadata", () => {
    for (const file of [
      "src/app/taro/page.tsx",
      "src/app/runy/page.tsx",
      "src/app/numerology/page.tsx",
      "src/app/prognoz/page.tsx",
      "src/app/statyi/page.tsx",
      "src/app/runy/[slug]/page.tsx",
      "src/app/statyi/[slug]/page.tsx",
      "src/app/numerology/[slug]/page.tsx",
    ]) {
      const src = read(file);
      expect(src, file).toContain("buildSeoMetadataWithOverrides");
    }
  });

  it("canonical override wins over base metadata", () => {
    const base = buildSeoMetadata({
      title: "Base",
      description: "Desc",
      path: "/taro",
    });
    expect(String(base.alternates?.canonical)).toMatch(/\/taro$/);
  });

  it("seo_content_change applies override for safe fields", () => {
    const src = read("src/app/(ads)/api/ads/admin/approvals/route.ts");
    expect(src).toContain("isSeoOverrideField");
    expect(src).toContain("seo_content_change");
    expect(src).toContain("applySeoOverride");
    const rules = read("src/modules/ads/organic/seo-rules.ts");
    expect(rules).toContain("sanitizeSchemaJson");
    expect(rules).toContain("pinCanonicalToAppOrigin");
  });
});
