import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canAutoSupersede,
  canMutateExistingFact,
  isProtectedFact,
  memoryAuthorityRank,
} from "@/lib/memory/authority";
import { classifyFactConflict } from "@/lib/memory/contradictions";
import {
  entitiesCompatibleForMerge,
  extractPersonMentions,
  mentionMatchesEntity,
  personEntityKey,
  stemRussianGivenName,
} from "@/lib/memory/entities";
import { filterGroundedFacts } from "@/lib/memory/grounding";
import { isQualityMemoryFact } from "@/lib/memory/user-fact-input";
import { classifyMemoryLayer, isCoreIdentityFact } from "@/lib/memory/memory-layers";
import { memoryBudgetFor, resolveMemoryDepth } from "@/lib/memory/memory-budget";
import { expandMemoryQuery } from "@/lib/memory/query-expansion";
import { serializeClientMemoryPack, type ClientMemoryPack } from "@/lib/memory/client-memory-pack";
import { composeMemoryQueryText } from "@/lib/memory/memory-relevance";

const ROOT = path.resolve(__dirname, "../..");
function readSrc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function emptyPack(over: Partial<ClientMemoryPack> = {}): ClientMemoryPack {
  return {
    coreFacts: [],
    currentState: [],
    people: [],
    timeline: [],
    goals: [],
    upcomingEvents: [],
    relevantFacts: [],
    userConfirmed: [],
    contradictions: [],
    expansion: expandMemoryQuery("тест"),
    metrics: {
      memory_candidates_count: 0,
      memory_selected_count: 0,
      memory_core_count: 0,
      memory_entity_matches_count: 0,
      memory_timeline_matches_count: 0,
      memory_archived_matches_count: 0,
      memory_context_chars: 0,
      memory_retrieval_ms: 0,
    },
    ...over,
  };
}

function fact(partial: {
  id: string;
  fact: string;
  predicateKey?: string;
  entityKey?: string;
  status?: string;
  captureTier?: "draft" | "durable" | "user_confirmed";
  sourceType?: string;
  sourceCharacter?: string;
}): import("@/lib/memory/user-facts").UserFact {
  return {
    id: partial.id,
    fact: partial.fact,
    category: "other",
    eventDate: null,
    sourceCharacter: partial.sourceCharacter ?? null,
    salience: 3,
    status: partial.status ?? "active",
    predicateKey: partial.predicateKey ?? null,
    entityKey: partial.entityKey ?? null,
    subjectKey: "client",
    captureTier: partial.captureTier ?? "durable",
    sourceType: partial.sourceType ?? "chat",
  };
}

describe("client-memory-v3 authority", () => {
  it("ranks user-authored above extracted and draft", () => {
    expect(memoryAuthorityRank({ sourceType: "user" })).toBe(1);
    expect(memoryAuthorityRank({ captureTier: "user_confirmed" })).toBe(2);
    expect(memoryAuthorityRank({ captureTier: "durable", confidence: 0.95 })).toBe(3);
    expect(memoryAuthorityRank({ captureTier: "draft", confidence: 0.7 })).toBe(4);
  });

  it("scenario 3: auto extraction cannot rewrite a protected manual fact", () => {
    const manual = { sourceType: "user", sourceCharacter: "user", captureTier: "user_confirmed" };
    const auto = { sourceType: "chat", captureTier: "durable", confidence: 0.9 };
    expect(isProtectedFact(manual)).toBe(true);
    expect(canMutateExistingFact(manual, auto)).toBe(false);
    expect(canAutoSupersede(manual, auto)).toBe(false);
    expect(canMutateExistingFact(manual, { sourceType: "user" })).toBe(true);
  });
});

describe("client-memory-v3 entities", () => {
  it("scenario 1: Сергей mention expands to person entity + relationship predicates", () => {
    const expanded = expandMemoryQuery("Что сейчас между мной и Сергеем?");
    expect(expanded.personMentions).toContain("Сергеем");
    expect(expanded.entityKeys.some((key) => key.startsWith("person:serg"))).toBe(true);
    expect(expanded.predicateHints).toContain("relationship.status");
    expect(expanded.wantsTimeline).toBe(true);
  });

  it("scenario 5: two people with the same first name do not merge", () => {
    expect(
      entitiesCompatibleForMerge(
        { entityKey: "person:sergey:former_spouse" },
        { entityKey: "person:sergey:colleague" }
      )
    ).toBe(false);
    expect(
      entitiesCompatibleForMerge(
        { entityKey: "person:sergey" },
        { entityKey: "person:ivan" }
      )
    ).toBe(false);
    expect(
      entitiesCompatibleForMerge(
        { entityKey: "person:sergey:former_spouse" },
        { entityKey: "person:sergey:former_spouse" }
      )
    ).toBe(true);
  });

  it("does not invent an entity merge from a bare first name", () => {
    expect(personEntityKey("Сергей")).toBe(personEntityKey("Сергеем"));
    expect(personEntityKey("Сергей", "former_spouse")).toBe(
      `${personEntityKey("Сергей")}:formerspouse`
    );
    expect(mentionMatchesEntity("Сергей", personEntityKey("Сергеем"))).toBe(true);
    expect(extractPersonMentions("Что сейчас с Сергеем?")).toContain("Сергеем");
  });
});

describe("client-memory-v3 timeline and contradictions", () => {
  it("scenario 2: employment.searching → current is a temporal update", () => {
    expect(
      classifyFactConflict(
        { fact: "Клиент ищет работу", predicateKey: "employment.searching", subjectKey: "client" },
        {
          fact: "Клиент устроился менеджером в X",
          predicateKey: "employment.current",
          subjectKey: "client",
          operation: "replace",
        }
      )
    ).toBe("temporal_update");
  });

  it("same text is a duplicate, not a contradiction", () => {
    expect(
      classifyFactConflict(
        { fact: "Клиент живёт в Волжском", predicateKey: "residence.current" },
        { fact: "Клиент живёт в Волжском", predicateKey: "residence.current" }
      )
    ).toBe("same_fact");
  });

  it("classifies superseded employment as timeline", () => {
    expect(
      classifyMemoryLayer({
        predicateKey: "employment.searching",
        status: "superseded",
      })
    ).toBe("timeline");
  });
});

describe("client-memory-v3 retrieval budget", () => {
  it("scenario 8: compact budget stays smaller than a deep report", () => {
    const compact = memoryBudgetFor("compact");
    const deep = memoryBudgetFor("deep");
    expect(compact.maxFactLines).toBeLessThan(deep.maxFactLines);
    expect(compact.maxBlockChars).toBeLessThan(deep.maxBlockChars);
    expect(resolveMemoryDepth({ product: "daily" })).toBe("compact");
    expect(resolveMemoryDepth({ product: "natal" })).toBe("deep");
    expect(resolveMemoryDepth({ product: "hd" })).toBe("deep");
  });

  it("does not let family flood an unrelated compact serialization", () => {
    const family = fact({
      id: "1",
      fact: "У клиента сын Артём",
      predicateKey: "family.child",
      entityKey: "person:artem:child",
    });
    const work = fact({
      id: "2",
      fact: "Клиент работает менеджером",
      predicateKey: "employment.current",
    });
    const block = serializeClientMemoryPack(
      emptyPack({ coreFacts: [work], people: [family] }),
      memoryBudgetFor("compact")
    );
    expect(block).toContain("менеджером");
    expect(block.length).toBeLessThanOrEqual(memoryBudgetFor("compact").maxBlockChars);
  });

  it("never truncates security rules when dropping layers", () => {
    const huge = "Клиент ".repeat(400) + "живёт в длинной биографии";
    const block = serializeClientMemoryPack(
      emptyPack({
        relevantFacts: [fact({ id: "r", fact: huge })],
        coreFacts: [fact({ id: "c", fact: "Клиент в браке", predicateKey: "relationship.status" })],
      }),
      memoryBudgetFor("compact")
    );
    expect(block).toContain("ПРАВИЛА БЕЗОПАСНОСТИ ПАМЯТИ");
  });

  it("core identity facts have a dedicated classifier path", () => {
    expect(
      isCoreIdentityFact({
        predicateKey: "relationship.status",
        captureTier: "user_confirmed",
      })
    ).toBe(true);
  });
});

describe("client-memory-v3 capture and privacy", () => {
  it("scenario 9: master prediction never becomes a grounded fact", () => {
    const kept = filterGroundedFacts("Я думаю о работе", [
      { fact: "Клиент скоро выйдет замуж", evidenceQuote: "карты обещают свадьбу" },
    ]);
    expect(kept).toHaveLength(0);
  });

  it("scenario 11: empty query stays empty so memory-off / no-topic cannot leak", () => {
    expect(
      composeMemoryQueryText({
        lastUserMessage: "",
        intention: null,
        customQuestion: null,
        mainQuestion: "Семья и развод",
      })
    ).toBe("");
  });
});

describe("client-memory-v3 cross-master and cross-product wiring", () => {
  it("scenario 6: long-term facts are user-scoped, not master-scoped", () => {
    const facts = readSrc("src/lib/memory/user-facts.ts");
    expect(facts).toContain("WHERE user_id = $1");
    expect(facts).not.toMatch(/searchFacts[\s\S]{0,400}character_key/);
    const sessions = readSrc("src/lib/user-memory.ts");
    expect(sessions).toContain("character_key !== characterKey");
  });

  it("scenario 7: authenticated products share buildMemoryContext", () => {
    const files = [
      "src/lib/services/chat-orchestrator.ts",
      "src/app/api/reading/route.ts",
      "src/app/api/intention-spread/route.ts",
      "src/app/api/photo-reading/stream/route.ts",
      "src/lib/daily-energy.ts",
      "src/lib/natal/personalization-lens.ts",
      "src/lib/human-design/personalization-lens.ts",
      "src/lib/services/numerology-tool-runner.ts",
      "src/lib/ritual-generation-runner.ts",
    ];
    for (const file of files) {
      expect(readSrc(file), file).toContain("buildMemoryContext");
    }
  });

  it("memory must not change deterministic HD / natal / matrix calculations", () => {
    const hd = readSrc("src/lib/human-design/personalization-lens.ts");
    const natal = readSrc("src/lib/natal/personalization-lens.ts");
    const matrix = readSrc("src/lib/numerology/matrix-sectioned-reading.ts");
    expect(hd).toMatch(/не имеет права менять расчёт|не источник фактов карты/i);
    expect(natal).toMatch(/не источник фактов карты/i);
    expect(matrix).toMatch(/does not change arcana numbers/i);
  });
});

describe("client-memory-v3 archive and write path", () => {
  it("scenario 4: overflow archives instead of deleting", () => {
    const src = readSrc("src/lib/memory/user-facts.ts");
    expect(src).toContain("archive_tier = 'archived'");
    expect(src).not.toMatch(/async function pruneUser[\s\S]{0,400}DELETE FROM user_facts/);
    expect(src).not.toMatch(/export async function expireStaleFacts[\s\S]{0,800}DELETE FROM user_facts/);
  });

  it("scenario 10: user delete still tombstones so auto-reingest is blocked", () => {
    const src = readSrc("src/lib/memory/user-facts.ts");
    expect(src).toMatch(/export async function deleteFact[\s\S]*addTombstone/);
    expect(src).toMatch(/export async function purgeAllUserMemory[\s\S]*addTombstone/);
  });

  it("protected facts are excluded from auto-archive", () => {
    const src = readSrc("src/lib/memory/user-facts.ts");
    expect(src).toMatch(/capture_tier = 'user_confirmed'/);
    expect(src).toMatch(/source_type IN \('user', 'profile'\)/);
  });
});

describe("client-memory-v3 quality regressions", () => {
  it("A: мастерская is a life fact, not meta", () => {
    expect(isQualityMemoryFact("Клиент хочет открыть мастерскую в Москве")).toBe(true);
    expect(isQualityMemoryFact("Клиент ведёт студию керамики в мастерской")).toBe(true);
  });

  it("B: master prediction is not a life fact", () => {
    expect(isQualityMemoryFact("Мастер предсказал скорую свадьбу")).toBe(false);
    const kept = filterGroundedFacts("Я думаю о работе", [
      { fact: "Клиент скоро выйдет замуж", evidenceQuote: "карты обещают свадьбу" },
    ]);
    expect(kept).toHaveLength(0);
  });

  it("C: role-distinct Сергеи stay separate in expansion", () => {
    const known = [
      personEntityKey("Сергей", "former_spouse")!,
      personEntityKey("Сергей", "коллега")!,
      personEntityKey("Сергей Петров", "врач")!,
    ];
    const ex = expandMemoryQuery("Что сейчас между мной и бывшим мужем Сергеем?", known);
    expect(ex.entityKeys).toEqual([personEntityKey("Сергей", "former_spouse")]);
    const col = expandMemoryQuery("Как строить работу с коллегой Сергеем из продаж?", known);
    expect(col.entityKeys).toEqual([personEntityKey("Сергей", "коллега")]);
    const doc = expandMemoryQuery("Стоит ли доверять врачу Сергею Петрову?", known);
    expect(doc.entityKeys).toEqual([personEntityKey("Сергей Петров", "врач")]);
  });

  it("D: Сергею and Андрею share the nominative stem", () => {
    expect(stemRussianGivenName("Сергею")).toBe(stemRussianGivenName("Сергей"));
    expect(stemRussianGivenName("Сергея")).toBe(stemRussianGivenName("Сергеем"));
    expect(personEntityKey("Сергею")).toBe(personEntityKey("Сергей"));
    expect(stemRussianGivenName("Андрею")).toBe(stemRussianGivenName("Андрей"));
    expect(personEntityKey("Андреем")).toBe(personEntityKey("Андрея"));
    expect(stemRussianGivenName("Ольгой")).toBe(stemRussianGivenName("Ольга"));
    expect(personEntityKey("Ольгой")).toBe(personEntityKey("Ольга"));
    expect(stemRussianGivenName("Ниной")).toBe(stemRussianGivenName("Нина"));
    expect(personEntityKey("Ниной")).toBe(personEntityKey("Нина"));
  });

  it("E: relationship + son + mother unions family predicates", () => {
    const expanded = expandMemoryQuery("Как сейчас мои отношения с сыном и мамой?");
    expect(expanded.predicateHints).toEqual(
      expect.arrayContaining([
        "relationship.status",
        "family.child",
        "family.parent",
        "family.relative",
        "family.spouse",
      ])
    );
  });

  it("F: work topic does not include family.child", () => {
    const expanded = expandMemoryQuery("Стоит ли менять работу?");
    expect(expanded.predicateHints).not.toContain("family.child");
    expect(expanded.topic).toBe("work");
  });

  it("I: contact preference expands to preference.stated", () => {
    expect(expandMemoryQuery("Как лучше со мной связываться по почте?").predicateHints).toContain(
      "preference.stated"
    );
    expect(expandMemoryQuery("Что я предпочитаю?").predicateHints).toContain("preference.stated");
  });

  it("J: Казани / Аэрофлот are not person entities", () => {
    expect(extractPersonMentions("В месяце 30 я ездила в Казани по делам Аэрофлот")).toEqual([]);
    expect(extractPersonMentions("Живу в Москве уже год")).toEqual([]);
  });
});
