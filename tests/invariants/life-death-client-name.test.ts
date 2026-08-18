import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/prompts";
import { LIFE_DEATH_AFTER_CONTEXT, LIFE_DEATH_TOPIC } from "@/lib/prompts/topics";
import { buildGenderPronounBlock } from "@/lib/prompts/gender-context";
import { buildSpreadBlock } from "@/lib/spread-block";
import type { PromptUserContext } from "@/lib/prompts/types";

const user: PromptUserContext = {
  name: "Геннадий",
  gender: "male",
  zodiac: "Рак",
  birthDate: "1970-01-01",
  cards: ["Император", "9 Пентаклей", "5 Пентаклей"],
  isPaid: true,
};

describe("life_death / third-party: client name is not the missing person", () => {
  it("life_death prompt tells the model not to substitute the profile name", () => {
    const prompt = buildSystemPrompt("veronika", user, {
      mode: "reading",
      intention: "life_death",
      lastUserMessage: "жив ли он",
      spreadId: "triplet",
    });
    expect(prompt).toContain("Имя клиента (кто спрашивает, не предмет вопроса): Геннадий");
    expect(prompt).toContain("ИМЯ КЛИЕНТА ≠ СУБЪЕКТ ВОПРОСА");
    expect(prompt).not.toContain("обращайся по имени минимум дважды");
  });

  it("life_death protocol forbids substituting the querent name", () => {
    expect(LIFE_DEATH_TOPIC).toContain("ИМЯ КЛИЕНТА ≠ ПРОПАВШИЙ");
    expect(LIFE_DEATH_TOPIC).toContain("ЗАПРЕЩЕНО подставлять имя клиента");
    expect(LIFE_DEATH_AFTER_CONTEXT).toContain("Имя клиента в профиле — спрашивающий, не пропавший");
  });

  it("gender block on «жив ли он» repeats the name split", () => {
    const block = buildGenderPronounBlock(user, "жив ли он");
    expect(block).toContain("ИМЯ КЛИЕНТА ≠ СУБЪЕКТ ВОПРОСА");
  });

  it("ready-to-read spread block does not tell the model to reuse the profile name", () => {
    const block = buildSpreadBlock(
      "new",
      ["Император", "9 Пентаклей", "5 Пентаклей"],
      "life_death",
      {
        readyToRead: true,
        spreadId: "triplet",
      }
    );
    expect(block).toContain("Имя клиента в профиле — не пропавший");
    expect(block).not.toContain("Обращайся к тому, что сказал пользователь (имя, срок");
  });
});
