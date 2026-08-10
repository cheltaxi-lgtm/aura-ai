/**
 * Deterministic Human Design Connection Chart analysis.
 * Themes follow standard partnership mechanics: electromagnetic, companionship,
 * dominance, compromise — plus type/authority/profile decision dynamics.
 */

import type { HdCenterKey, HdChart, HdTypeKey, HdAuthorityKey } from "./types";
import {
  AUTHORITY_NAMES_RU,
  CENTER_NAMES_RU,
  CHANNELS,
  PROFILE_NAMES_RU,
  TYPE_META,
} from "./constants";
import { formatHdEvidence } from "./prompt";

export type HdConnectionRelation =
  | "partner"
  | "friend"
  | "child"
  | "colleague"
  | "business";

export const HD_CONNECTION_RELATIONS: ReadonlyArray<{
  id: HdConnectionRelation;
  label: string;
  hint: string;
}> = [
  { id: "partner", label: "Партнёр", hint: "близость, быт, решения вдвоём" },
  { id: "friend", label: "Друг", hint: "поддержка, ритм общения" },
  { id: "child", label: "Ребёнок / родитель", hint: "забота, границы, рост" },
  { id: "colleague", label: "Коллега", hint: "работа рядом, роли" },
  { id: "business", label: "Бизнес", hint: "стратегия, ответственность" },
];

export type HdChannelBondKind =
  | "electromagnetic"
  | "companionship"
  | "dominanceA"
  | "dominanceB"
  | "compromiseA"
  | "compromiseB";

export interface HdChannelBond {
  key: string;
  nameRu: string;
  gates: [number, number];
  centers: [HdCenterKey, HdCenterKey];
  kind: HdChannelBondKind;
  summary: string;
}

export interface HdCenterBond {
  center: HdCenterKey;
  nameRu: string;
  aDefined: boolean;
  bDefined: boolean;
  kind: "both" | "aOnly" | "bOnly" | "open";
  summary: string;
}

export interface HdConnectionAnalysis {
  electromagnetic: HdChannelBond[];
  companionship: HdChannelBond[];
  dominanceA: HdChannelBond[];
  dominanceB: HdChannelBond[];
  compromise: HdChannelBond[];
  centers: HdCenterBond[];
  sharedGates: number[];
  aOnlyGates: number[];
  bOnlyGates: number[];
  electromagneticKeys: Set<string>;
  partnerOnlyGates: Set<number>;
  mergedChart: HdChart;
  typeA: HdTypeKey;
  typeB: HdTypeKey;
  authorityA: HdAuthorityKey;
  authorityB: HdAuthorityKey;
  profileA: string;
  profileB: string;
  headline: string;
  harmonyNotes: string[];
  frictionNotes: string[];
  decisionNote: string;
  stats: {
    electroCount: number;
    companionshipCount: number;
    sharedGateCount: number;
    sharedCenterCount: number;
    dominanceCount: number;
  };
}

function channelKey(gates: readonly [number, number]): string {
  return `${gates[0]}-${gates[1]}`;
}

function centerSummary(
  kind: HdCenterBond["kind"],
  name: string,
  labelA: string,
  labelB: string
): string {
  switch (kind) {
    case "both":
      return `${name}: определён у обоих — устойчивая общая тема.`;
    case "aOnly":
      return `${name}: определён у ${labelA}, открыт у ${labelB} — ${labelA} задаёт тон, ${labelB} усиливает/впитывает.`;
    case "bOnly":
      return `${name}: определён у ${labelB}, открыт у ${labelA} — ${labelB} задаёт тон, ${labelA} усиливает/впитывает.`;
    default:
      return `${name}: открыт у обоих — тема проявляется через окружение и вместе.`;
  }
}

function bondSummary(kind: HdChannelBondKind, name: string, labelA: string, labelB: string): string {
  switch (kind) {
    case "electromagnetic":
      return `«${name}» — электромагнетика: канал собирается только вместе (химия и притяжение).`;
    case "companionship":
      return `«${name}» — companionship: канал есть у обоих (общая сила и общие слепые зоны).`;
    case "dominanceA":
      return `«${name}» — доминантность ${labelA}: канал полностью у ${labelA}.`;
    case "dominanceB":
      return `«${name}» — доминантность ${labelB}: канал полностью у ${labelB}.`;
    case "compromiseA":
      return `«${name}» — компромисс: канал у ${labelA}, у ${labelB} висячие ворота этого канала.`;
    case "compromiseB":
      return `«${name}» — компромисс: канал у ${labelB}, у ${labelA} висячие ворота этого канала.`;
  }
}

function decisionNoteFor(
  typeA: HdTypeKey,
  typeB: HdTypeKey,
  authA: HdAuthorityKey,
  authB: HdAuthorityKey,
  labelA: string,
  labelB: string
): string {
  const sameAuth = authA === authB;
  const a = TYPE_META[typeA];
  const b = TYPE_META[typeB];
  const authPart = sameAuth
    ? `Авторитет общий (${AUTHORITY_NAMES_RU[authA]}) — решения можно сверять в одном ритме.`
    : `Авторитеты разные: ${labelA} — ${AUTHORITY_NAMES_RU[authA]}, ${labelB} — ${AUTHORITY_NAMES_RU[authB]}. Не торопите друг друга чужой скоростью.`;
  return (
    `${labelA}: ${a.nameRu} («${a.strategyRu}»). ${labelB}: ${b.nameRu} («${b.strategyRu}»). ${authPart}`
  );
}

function buildHeadline(analysis: {
  electro: number;
  companionship: number;
  sharedCenters: number;
  sameAuthority: boolean;
  typeA: string;
  typeB: string;
}): string {
  const bits: string[] = [];
  if (analysis.electro >= 3) bits.push("сильная электромагнетика");
  else if (analysis.electro >= 1) bits.push("есть химия электромагнетики");
  else bits.push("мягкая связь без резких искр");

  if (analysis.companionship >= 2) bits.push("много общих каналов");
  if (analysis.sharedCenters >= 4) bits.push("плотное пересечение центров");
  if (!analysis.sameAuthority) bits.push("разные авторитеты");
  if (analysis.typeA === analysis.typeB) bits.push(`оба — ${analysis.typeA}`);

  return bits.slice(0, 3).join(" · ");
}

/** Full connection analysis for two charts (A = base / «вы», B = partner). */
export function analyzeHdConnection(
  chartA: HdChart,
  chartB: HdChart,
  labels: { a?: string; b?: string } = {}
): HdConnectionAnalysis {
  const labelA = labels.a?.trim() || "вы";
  const labelB = labels.b?.trim() || "партнёр";

  const gatesA = new Set(chartA.activeGates);
  const gatesB = new Set(chartB.activeGates);
  const definedA = new Set(chartA.channels.filter((c) => c.defined).map((c) => c.key));
  const definedB = new Set(chartB.channels.filter((c) => c.defined).map((c) => c.key));

  const electromagnetic: HdChannelBond[] = [];
  const companionship: HdChannelBond[] = [];
  const dominanceA: HdChannelBond[] = [];
  const dominanceB: HdChannelBond[] = [];
  const compromise: HdChannelBond[] = [];

  for (const ch of CHANNELS) {
    const key = channelKey(ch.gates);
    const [g1, g2] = ch.gates;
    const aFull = definedA.has(key);
    const bFull = definedB.has(key);
    const aHas1 = gatesA.has(g1);
    const aHas2 = gatesA.has(g2);
    const bHas1 = gatesB.has(g1);
    const bHas2 = gatesB.has(g2);
    const together =
      (aHas1 || bHas1) && (aHas2 || bHas2) && (aHas1 || aHas2) && (bHas1 || bHas2);

    let kind: HdChannelBondKind | null = null;
    if (aFull && bFull) kind = "companionship";
    else if (!aFull && !bFull && together && aHas1 !== aHas2 && bHas1 !== bHas2) {
      // Each side brings the missing gate(s) → electromagnetic
      kind = "electromagnetic";
    } else if (aFull && !bFull && (bHas1 || bHas2) && !(bHas1 && bHas2)) {
      kind = "compromiseA";
    } else if (bFull && !aFull && (aHas1 || aHas2) && !(aHas1 && aHas2)) {
      kind = "compromiseB";
    } else if (aFull && !bFull) kind = "dominanceA";
    else if (bFull && !aFull) kind = "dominanceB";

    if (!kind) continue;
    const bond: HdChannelBond = {
      key,
      nameRu: ch.nameRu,
      gates: [ch.gates[0], ch.gates[1]],
      centers: [ch.centers[0], ch.centers[1]],
      kind,
      summary: bondSummary(kind, ch.nameRu, labelA, labelB),
    };
    if (kind === "electromagnetic") electromagnetic.push(bond);
    else if (kind === "companionship") companionship.push(bond);
    else if (kind === "dominanceA") dominanceA.push(bond);
    else if (kind === "dominanceB") dominanceB.push(bond);
    else compromise.push(bond);
  }

  const allCenters = Object.keys(CENTER_NAMES_RU) as HdCenterKey[];
  const centers: HdCenterBond[] = allCenters.map((center) => {
    const aDefined = chartA.definedCenters.includes(center);
    const bDefined = chartB.definedCenters.includes(center);
    const kind: HdCenterBond["kind"] =
      aDefined && bDefined ? "both" : aDefined ? "aOnly" : bDefined ? "bOnly" : "open";
    return {
      center,
      nameRu: CENTER_NAMES_RU[center],
      aDefined,
      bDefined,
      kind,
      summary: centerSummary(kind, CENTER_NAMES_RU[center], labelA, labelB),
    };
  });

  const sharedGates = chartA.activeGates.filter((g) => gatesB.has(g));
  const aOnlyGates = chartA.activeGates.filter((g) => !gatesB.has(g));
  const bOnlyGates = chartB.activeGates.filter((g) => !gatesA.has(g));

  const unionGates = new Set([...gatesA, ...gatesB]);
  const mergedChannels = CHANNELS.map((ch) => {
    const key = channelKey(ch.gates);
    return {
      key,
      gates: [ch.gates[0], ch.gates[1]] as [number, number],
      centers: [ch.centers[0], ch.centers[1]] as [HdCenterKey, HdCenterKey],
      defined: unionGates.has(ch.gates[0]) && unionGates.has(ch.gates[1]),
    };
  });
  const definedCenters = [
    ...new Set(mergedChannels.filter((c) => c.defined).flatMap((c) => c.centers)),
  ];
  const mergedChart: HdChart = {
    ...chartA,
    activeGates: [...unionGates].sort((x, y) => x - y),
    channels: mergedChannels,
    definedCenters,
  };

  const sharedCenterCount = centers.filter((c) => c.kind === "both").length;
  const harmonyNotes: string[] = [];
  const frictionNotes: string[] = [];

  if (electromagnetic.length) {
    harmonyNotes.push(
      `Электромагнетика (${electromagnetic.length}): ${electromagnetic
        .slice(0, 4)
        .map((c) => `«${c.nameRu}»`)
        .join(", ")}${electromagnetic.length > 4 ? "…" : ""}`
    );
  }
  if (companionship.length) {
    harmonyNotes.push(
      `Общие каналы (${companionship.length}): знакомая сила и общие привычки.`
    );
  }
  if (sharedCenterCount >= 3) {
    harmonyNotes.push(`Общих определённых центров: ${sharedCenterCount} — плотная опора.`);
  }
  if (chartA.type === chartB.type) {
    harmonyNotes.push(`Одинаковый тип «${TYPE_META[chartA.type].nameRu}» — похожий язык энергии.`);
  }

  if (chartA.authority !== chartB.authority) {
    frictionNotes.push(
      `Разные авторитеты (${AUTHORITY_NAMES_RU[chartA.authority]} / ${AUTHORITY_NAMES_RU[chartB.authority]}) — решения в разном темпе.`
    );
  }
  if (TYPE_META[chartA.type].strategyRu !== TYPE_META[chartB.type].strategyRu) {
    frictionNotes.push(
      `Разные стратегии («${TYPE_META[chartA.type].strategyRu}» / «${TYPE_META[chartB.type].strategyRu}») — важно не давить.`
    );
  }
  const conditioned = centers.filter((c) => c.kind === "aOnly" || c.kind === "bOnly");
  if (conditioned.length >= 4) {
    frictionNotes.push(
      `Много односторонне определённых центров (${conditioned.length}) — легко «перетягивать» друг друга.`
    );
  }
  if (compromise.length >= 2) {
    frictionNotes.push(
      `Компромиссные каналы (${compromise.length}): один несёт канал, второй — висячие ворота.`
    );
  }
  if (!electromagnetic.length && !companionship.length) {
    frictionNotes.push("Мало канальных связей — связь держится на центрах, типах и выборе, не на «искре».");
  }

  const headline = buildHeadline({
    electro: electromagnetic.length,
    companionship: companionship.length,
    sharedCenters: sharedCenterCount,
    sameAuthority: chartA.authority === chartB.authority,
    typeA: TYPE_META[chartA.type].nameRu,
    typeB: TYPE_META[chartB.type].nameRu,
  });

  return {
    electromagnetic,
    companionship,
    dominanceA,
    dominanceB,
    compromise,
    centers,
    sharedGates,
    aOnlyGates,
    bOnlyGates,
    electromagneticKeys: new Set(electromagnetic.map((c) => c.key)),
    partnerOnlyGates: new Set(bOnlyGates),
    mergedChart,
    typeA: chartA.type,
    typeB: chartB.type,
    authorityA: chartA.authority,
    authorityB: chartB.authority,
    profileA: chartA.profile,
    profileB: chartB.profile,
    headline,
    harmonyNotes,
    frictionNotes,
    decisionNote: decisionNoteFor(
      chartA.type,
      chartB.type,
      chartA.authority,
      chartB.authority,
      labelA,
      labelB
    ),
    stats: {
      electroCount: electromagnetic.length,
      companionshipCount: companionship.length,
      sharedGateCount: sharedGates.length,
      sharedCenterCount,
      dominanceCount: dominanceA.length + dominanceB.length,
    },
  };
}

/** Evidence block for LLM composite reports — mechanics only. */
export function formatHdConnectionEvidence(
  chartA: HdChart,
  chartB: HdChart,
  names: { a: string; b: string },
  relation?: HdConnectionRelation | null,
  places?: { a?: string | null; b?: string | null }
): string {
  const conn = analyzeHdConnection(chartA, chartB, names);
  const rel =
    HD_CONNECTION_RELATIONS.find((r) => r.id === relation)?.label ?? "пара / связь";

  const lines: string[] = [];
  lines.push(`СЦЕНАРИЙ СВЯЗИ: ${rel}`);
  lines.push(`ЗАГОЛОВОК МЕХАНИКИ: ${conn.headline}`);
  lines.push("");
  lines.push(
    `ТИПЫ: ${names.a} — ${TYPE_META[conn.typeA].nameRu} (${TYPE_META[conn.typeA].strategyRu}); ` +
      `${names.b} — ${TYPE_META[conn.typeB].nameRu} (${TYPE_META[conn.typeB].strategyRu})`
  );
  lines.push(
    `АВТОРИТЕТЫ: ${names.a} — ${AUTHORITY_NAMES_RU[conn.authorityA]}; ${names.b} — ${AUTHORITY_NAMES_RU[conn.authorityB]}`
  );
  lines.push(
    `ПРОФИЛИ: ${names.a} — ${conn.profileA} (${PROFILE_NAMES_RU[conn.profileA] ?? ""}); ` +
      `${names.b} — ${conn.profileB} (${PROFILE_NAMES_RU[conn.profileB] ?? ""})`
  );
  lines.push(`РЕШЕНИЯ: ${conn.decisionNote}`);
  lines.push("");
  lines.push("ЭЛЕКТРОМАГНЕТИКА:");
  if (!conn.electromagnetic.length) lines.push("- нет");
  else for (const c of conn.electromagnetic) lines.push(`- ${c.key} «${c.nameRu}»`);
  lines.push("COMPANIONSHIP (общие каналы):");
  if (!conn.companionship.length) lines.push("- нет");
  else for (const c of conn.companionship) lines.push(`- ${c.key} «${c.nameRu}»`);
  lines.push("ДОМИНАНТНОСТЬ КАНАЛОВ:");
  for (const c of [...conn.dominanceA, ...conn.dominanceB]) {
    lines.push(`- ${c.key} «${c.nameRu}» (${c.kind})`);
  }
  if (!conn.dominanceA.length && !conn.dominanceB.length) lines.push("- нет");
  lines.push("КОМПРОМИСС:");
  if (!conn.compromise.length) lines.push("- нет");
  else for (const c of conn.compromise) lines.push(`- ${c.key} «${c.nameRu}» (${c.kind})`);
  lines.push("");
  lines.push("ЦЕНТРЫ:");
  for (const c of conn.centers) {
    lines.push(`- ${c.nameRu}: ${c.kind}`);
  }
  lines.push("");
  lines.push("СООТВЕТСТВИЯ:");
  for (const n of conn.harmonyNotes) lines.push(`- ${n}`);
  if (!conn.harmonyNotes.length) lines.push("- (немного явных опор — смотри типы и центры)");
  lines.push("НЕСООТВЕТСТВИЯ / ТРЕНИЕ:");
  for (const n of conn.frictionNotes) lines.push(`- ${n}`);
  if (!conn.frictionNotes.length) lines.push("- явного трения по механике мало");
  lines.push("");
  lines.push(`КАРТА ${names.a}:`);
  lines.push(formatHdEvidence(chartA, { placeLabel: places?.a ?? null }));
  lines.push("");
  lines.push(`КАРТА ${names.b}:`);
  lines.push(formatHdEvidence(chartB, { placeLabel: places?.b ?? null }));
  return lines.join("\n");
}

export function connectionRelationPromptHint(relation?: HdConnectionRelation | null): string {
  switch (relation) {
    case "friend":
      return "Акцент: дружба, поддержка, границы общения, совместные проекты без романтики.";
    case "child":
      return "Акцент: родитель/ребёнок, забота, безопасность, уважение ритма ребёнка, без романтизации.";
    case "colleague":
      return "Акцент: рабочее взаимодействие, роли, дедлайны, коммуникация в команде.";
    case "business":
      return "Акцент: партнёрство в деле, ответственность, деньги, стратегия, риски власти.";
    case "partner":
    default:
      return "Акцент: близость, поддержка, конфликты и совместные решения. Без вымышленных расписаний дня.";
  }
}
