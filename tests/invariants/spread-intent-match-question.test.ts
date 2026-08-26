import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  matchSpreadIntentDetailed,
  matchSpreadIntentFromQuestion,
} from "@/lib/spread-intents/match-question";

const JOB_HH_QUESTION =
  "я уже столько сделал откликов на hh.ru по новой работе но все молчат и не дают обратную связь, дадут ли кто тоо из них хоть какой то ответ э";

describe("matchSpreadIntentFromQuestion", () => {
  it("does not map a job-search question to a partner-info compatibility spread", () => {
    const match = matchSpreadIntentDetailed(JOB_HH_QUESTION);
    expect(match).not.toBeNull();
    expect(match!.intent.requiresPartnerInfo).toBeFalsy();
    expect(match!.intent.category).toBe("career");
    expect(match!.intent.slug).toBe("kak-nayti-rabotu");
    expect(match!.via).toBe("alias");
  });

  it("still routes explicit compatibility phrasing to a partner spread", () => {
    const match = matchSpreadIntentDetailed("насколько мы совместимы как пара?");
    expect(match?.via).toBe("alias");
    expect(match?.intent.slug).toBe("sovmestimost-pary");
    expect(match?.intent.requiresPartnerInfo).toBe(true);
  });

  it("keeps classic love phrasing", () => {
    expect(matchSpreadIntentFromQuestion("вернётся ли он")?.slug).toBe("vernyotsya-li-on");
    expect(matchSpreadIntentFromQuestion("что он чувствует")?.slug).toBe("chto-on-chuvstvuet");
  });

  it("maps dative «работе» to career, not featured compatibility", () => {
    const match = matchSpreadIntentDetailed("стоит ли оставаться на этой работе");
    expect(match?.intent.category).toBe("career");
    expect(match?.intent.requiresPartnerInfo).toBeFalsy();
  });

  it("does not treat generic «перспектива» as relationship perspective", () => {
    const match = matchSpreadIntentFromQuestion("какая перспектива у меня на работе");
    expect(match?.slug).not.toBe("perspektiva-otnosheniy");
    expect(match?.requiresPartnerInfo).toBeFalsy();
  });

  it("HomePage does not copy partner-info from a free-text fuzzy match", () => {
    const home = readFileSync(
      path.resolve(__dirname, "../../src/components/HomePage.tsx"),
      "utf8"
    );
    expect(home).toContain("matchSpreadIntentDetailed");
    expect(home).toContain("collectPartnerInfo");
    expect(home).toContain('matched.via === "alias"');
  });
});
