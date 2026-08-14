import {
  detectPersonRoleHints,
  entityKeyMatchesMentions,
  entityKeyMatchesRoleHints,
  extractPersonMentions,
  personEntityKey,
} from "@/lib/memory/entities";

export type MemoryQueryTopic =
  | "work"
  | "relationship"
  | "family"
  | "money"
  | "health"
  | "residence"
  | "education"
  | "goals"
  | "preferences"
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
  {
    topic: "preferences",
    re: /предпочит|удобн|связыв|почт|мессенджер|созвон|звонк|переписк/i,
    predicates: ["preference.stated"],
    extra: "предпочтения связь почта",
  },
];

export function detectMemoryTopic(query: string): MemoryQueryTopic {
  for (const rule of TOPIC_RULES) {
    if (rule.re.test(query)) return rule.topic;
  }
  return "general";
}

export function matchedMemoryTopics(query: string) {
  return TOPIC_RULES.filter((rule) => rule.re.test(query));
}

export function expandMemoryQuery(
  query: string,
  knownEntityKeys: string[] = []
): ExpandedMemoryQuery {
  const original = query.trim();
  const mentions = extractPersonMentions(original, knownEntityKeys);
  const mentionKeys = mentions
    .map((name) => personEntityKey(name))
    .filter((key): key is string => Boolean(key));
  const roleHints = detectPersonRoleHints(original);

  const matchedKnown = knownEntityKeys.filter((key) => {
    if (!entityKeyMatchesMentions(key, mentions)) return false;
    if (roleHints.length) return entityKeyMatchesRoleHints(key, roleHints);
    return true;
  });

  const entityKeys = [
    ...new Set(roleHints.length ? matchedKnown : [...matchedKnown, ...mentionKeys]),
  ];
  const matched = matchedMemoryTopics(original);
  const detected = detectMemoryTopic(original);
  const fallback =
    !matched.length && mentions.length
      ? TOPIC_RULES.find((item) => item.topic === "relationship")
      : undefined;
  const rules = matched.length ? matched : fallback ? [fallback] : [];
  const topic = (rules[0]?.topic ?? detected) as MemoryQueryTopic;
  const predicateHints = [...new Set(rules.flatMap((rule) => rule.predicates))];
  const extra = [...rules.map((rule) => rule.extra), mentions.join(" ")]
    .filter(Boolean)
    .join(" ");
  const expandedText = extra ? `${original} ${extra}`.trim() : original;

  return {
    original,
    expandedText,
    entityKeys,
    personMentions: mentions,
    predicateHints,
    topic,
    wantsTimeline: Boolean(rules.some((rule) => rule.timeline) || entityKeys.length),
  };
}
