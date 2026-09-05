import { describe, expect, it } from "vitest";
import { validateGuestTeaserQuality } from "@/lib/guest-triplet-teaser-service";
import { buildGuestNarrativeFallback } from "@/lib/guest-triplet-teaser";

const names = ["Луна", "Тройка Мечей", "Колесница"];
const complete = "После ссоры легко принять молчание за окончательный ответ. Луна здесь — образ неясности, Тройка Мечей — боли, а Колесница — возможности двигаться дальше без догадок о его чувствах. Попробуйте сформулировать, что именно вы хотели бы прояснить в спокойном разговоре.";
describe("guest teaser delivers a complete short answer", () => {
  it("accepts a grounded, completed reflection", () => {
    expect(validateGuestTeaserQuality(complete, names).ok).toBe(true);
  });
  it("rejects a token-limited answer cut during the final action", () => {
    expect(validateGuestTeaserQuality(complete.slice(0, complete.indexOf("что именно")), names)).toEqual({ ok: false, reason: "unfinished_answer" });
  });
  it("rejects overlong output instead of silently clipping the final advice", () => {
    expect(validateGuestTeaserQuality(complete + " Подробности ситуации требуют внимательного обсуждения.".repeat(8), names)).toEqual({ ok: false, reason: "too_long" });
  });
  it("fallback preserves all cards and offers a usable reflection without requiring signup", () => {
    const text = buildGuestNarrativeFallback("Как обсудить ссору?", names.map(name => ({ name })));
    for (const name of names) expect(text).toContain(name);
    expect(text).toContain("какой факт поможет её прояснить?");
    expect(text).not.toContain("после входа");
  });
});
