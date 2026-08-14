import { extractPersonMentions, personEntityKey, slugPersonName } from "@/lib/memory/entities";

export type MemoryQueryTopic =
  | "work"
  | "relationship"
  | "family"
  | "money"
  | "health"
  | "residence"
  | "education"
  | "goals"
  | "general";

export type ExpandedMemoryQuery = {
  original: string;
  expandedText: string;
  entityKeys: string[];
  personMentions: string[];
  predicateHints: string[];
  topic: MemoryQueryTopic;
  wantsTimeline: boolean;
};

const TOPIC_RULES: Array<{
  topic: MemoryQueryTopic;
  re: RegExp;
  predicates: string[];
  extra: string;
  timeline?: boolean;
}> = [
  {
    topic: "work",
    re: /работ|карьер|увол|офис|начальник|коллег|бизнес|устроил|менеджер|вакан|собеседован/i,
    predicates: [
      "employment.current",
      "employment.searching",
      "employment.former",
      "goal.current",
      "finance.debt",
    ],
    extra: "работа карьера трудоустройство цели деньги",
    timeline: true,
  },
  {
    topic: "relationship",
    re: /отношен|партн[её]р|муж|жена|бывш|развод|расста|свидан|любов|брак|между\s+мной|сейчас\s+(между|с)\s/i,
    predicates: [
      "relationship.status",
      "relationship.partner",
      "relationship.former_partner",
      "relationship.divorce",
      "family.spouse",
      "goal.current",
    ],
    extra: "отношения партнёр брак развод",
    timeline: true,
  },
  {
    topic: "family",
    re: /семь|родител|мама|папа|сын|доч|реб[её]н|дети|брат|сестр|родствен/i,
    predicates: ["family.child", "family.parent", "family.relative", "family.spouse"],
    extra: "семья дети родители родственники",
  },
  {
    topic: "money",
    re: /деньг|долг|ипотек|кредит|финанс|зарплат|доход|бюджет/i,
    predicates: ["finance.debt", "employment.current", "goal.current"],
    extra: "деньги долги работа",
  },
  {
    topic: "health",
    re: /здоров|болезн|диагноз|операц|беремен|лечен|врач/i,
    predicates: ["health.condition", "health.procedure"],
    extra: "здоровье",
  },
  {
    topic: "residence",
    re: /переезд|город|квартир|жил[аоы]|москв|питер|волжск/i,
    predicates: ["residence.current", "residence.former"],
    extra: "место жительства переезд",
    timeline: true,
  },
  {
    topic: "education",
    re: /учёб|учеб|универ|институт|диплом|курс/i,
    predicates: ["education.current", "education.former"],
    extra: "учёба образование",
  },
  {
    topic: "goals",
    re: /цел[ьи]|план|хочу|собираюсь|намерен/i,
    predicates: ["goal.current"],
    extra: "цели планы",
  },
];

export function detectMemoryTopic(query: string): MemoryQueryTopic {
  for (const rule of TOPIC_RULES) {
    if (rule.re.test(query)) return rule.topic;
  }
  return "general";
}

export function expandMemoryQuery(
  query: string,
  knownEntityKeys: string[] = []
): ExpandedMemoryQuery {
  const original = query.trim();
  const mentions = extractPersonMentions(original);
  const mentionKeys = mentions
    .map((name) => personEntityKey(name))
    .filter((key): key is string => Boolean(key));

  const matchedKnown = knownEntityKeys.filter((key) => {
    const slug = key.replace(/^person:/, "").split(":")[0];
    return mentions.some((name) => slugPersonName(name) === slug);
  });

  const entityKeys = [...new Set([...matchedKnown, ...mentionKeys])];
  const detected = detectMemoryTopic(original);
  const rule =
    TOPIC_RULES.find((item) => item.topic === detected) ??
    (mentions.length
      ? TOPIC_RULES.find((item) => item.topic === "relationship")
      : undefined);
  const topic = rule?.topic ?? (mentions.length ? "relationship" : "general");
  const predicateHints = rule?.predicates ?? [];
  const extra = [rule?.extra, mentions.join(" ")].filter(Boolean).join(" ");
  const expandedText = extra ? `${original} ${extra}`.trim() : original;

  return {
    original,
    expandedText,
    entityKeys,
    personMentions: mentions,
    predicateHints,
    topic,
    wantsTimeline: Boolean(rule?.timeline || entityKeys.length),
  };
}
