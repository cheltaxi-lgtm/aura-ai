import { describe, expect, it } from "vitest";
import {
  isSearchEngineBot,
  isSearchIndexableIntentSlug,
  isThinDaNetIntentSlug,
} from "./indexability";

describe("indexability", () => {
  it("marks mass da-net intents as thin / non-indexable", () => {
    expect(isThinDaNetIntentSlug("da-net-komandirovka")).toBe(true);
    expect(isSearchIndexableIntentSlug("da-net-komandirovka")).toBe(false);
    expect(isSearchIndexableIntentSlug("na-vernost")).toBe(true);
    expect(isSearchIndexableIntentSlug("chto-ona-chuvstvuet")).toBe(true);
    expect(isSearchIndexableIntentSlug("chto-chuvstvuet-ona")).toBe(false);
  });

  it("detects major search bots", () => {
    expect(isSearchEngineBot("Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)")).toBe(
      true
    );
    expect(isSearchEngineBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(
      true
    );
    expect(isSearchEngineBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0")).toBe(false);
  });
});
