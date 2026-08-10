import type { HdChart } from "@/lib/human-design/types";
import {
  AUTHORITY_NAMES_RU,
  CENTER_NAMES_RU,
  CROSS_ANGLE_NAMES_RU,
  CROSS_NAMES_RU,
  DEFINITION_NAMES_RU,
  GATE_NAMES_RU,
  PROFILE_NAMES_RU,
  TYPE_META,
} from "@/lib/human-design/constants";
import { hangingGates } from "@/lib/human-design/chart-extras";
import {
  formatHdBirthIdentity,
  type HdEvidenceOpts,
} from "@/lib/human-design/prompt";
import type { HdTypeKey } from "@/lib/human-design/types";

export type HdLockedContract = {
  typeKey: HdTypeKey;
  typeRu: string;
  strategyRu: string;
  /** Keywords that MUST appear for this type's strategy advice. */
  strategyKeywords: string[];
  /** Forbidden strategy advice phrases belonging to other types. */
  foreignStrategyPatterns: RegExp[];
  signatureRu: string;
  notSelfRu: string;
  authorityRu: string;
  profile: string;
  profileRu: string;
  definitionRu: string;
  crossAngleKey: string;
  crossAngleRu: string;
  /** Synonyms allowed in text for the engine angle. */
  crossAngleAliases: string[];
  crossNameRu: string;
  definedCentersRu: string[];
  openCentersRu: string[];
  definedChannels: string[];
  definedChannelKeys: string[];
  motorCentersDefinedRu: string[];
  hangingGateNumbers: number[];
  hangingGatesRu: string;
  crossGateNumbers: number[];
  contractBlock: string;
};

const MOTOR = new Set(["sacral", "solar", "root", "heart"]);

const STRATEGY_BY_TYPE: Record<
  HdTypeKey,
  { keywords: string[]; foreign: RegExp[] }
> = {
  manifestor: {
    keywords: ["информ"],
    foreign: [
      /ждите\s+приглашен/iu,
      /ждать\s+приглашен/iu,
      /ждите\s+отклик/iu,
      /лунн(ый|ого)\s+цикл/iu,
      /28\s+дн/iu,
    ],
  },
  generator: {
    keywords: ["отклик"],
    foreign: [
      /информируй(те)?\s+(сначала|до)/iu,
      /ждите\s+приглашен/iu,
      /ждать\s+приглашен/iu,
      /лунн(ый|ого)\s+цикл/iu,
      /28\s+дн/iu,
    ],
  },
  manifestingGenerator: {
    keywords: ["отклик"],
    foreign: [
      /ждите\s+приглашен/iu,
      /ждать\s+приглашен/iu,
      /информируй(те)?\s+(сначала|до)/iu,
      /лунн(ый|ого)\s+цикл/iu,
      /28\s+дн/iu,
    ],
  },
  projector: {
    keywords: ["приглашен"],
    foreign: [
      /информируй(те)?\s+(сначала|до)/iu,
      /лунн(ый|ого)\s+цикл/iu,
      /28\s+дн/iu,
    ],
  },
  reflector: {
    keywords: ["лунн", "28"],
    foreign: [
      /информируй(те)?\s+(сначала|до)/iu,
      /ждите\s+приглашен/iu,
      /ждать\s+приглашен/iu,
    ],
  },
};

function crossNameRu(chart: HdChart): string {
  const names = CROSS_NAMES_RU[chart.cross.gates[0]];
  if (!names) return chart.cross.nameEn;
  const index =
    chart.cross.angle === "right" ? 0 : chart.cross.angle === "juxtaposition" ? 1 : 2;
  return names[index] ?? chart.cross.nameEn;
}

function angleAliases(angle: string, angleRu: string): string[] {
  const base = [angleRu];
  if (angle === "right") base.push("Правый угол", "прямой угол");
  if (angle === "left") base.push("Левый угол");
  if (angle === "juxtaposition") base.push("Джукстапозиция", "Juxtaposition");
  return base;
}

export function buildHdLockedContract(
  chart: HdChart,
  opts?: HdEvidenceOpts
): HdLockedContract {
  const meta = TYPE_META[chart.type];
  const strat = STRATEGY_BY_TYPE[chart.type];
  const definedChannels = chart.channels
    .filter((ch) => ch.defined)
    .map(
      (ch) =>
        `${ch.key}: ${GATE_NAMES_RU[ch.gates[0]]} ↔ ${GATE_NAMES_RU[ch.gates[1]]} (${CENTER_NAMES_RU[ch.centers[0]]} — ${CENTER_NAMES_RU[ch.centers[1]]})`
    );
  const definedChannelKeys = chart.channels.filter((ch) => ch.defined).map((ch) => ch.key);
  const definedCentersRu = chart.definedCenters.map((c) => CENTER_NAMES_RU[c]);
  const openCentersRu = (
    Object.keys(CENTER_NAMES_RU) as Array<keyof typeof CENTER_NAMES_RU>
  )
    .filter((c) => !chart.definedCenters.includes(c))
    .map((c) => CENTER_NAMES_RU[c]);
  const motorCentersDefinedRu = chart.definedCenters
    .filter((c) => MOTOR.has(c))
    .map((c) => CENTER_NAMES_RU[c]);
  const hang = hangingGates(chart);
  const hangingGatesRu =
    hang.length === 0
      ? "нет"
      : hang.map((g) => `${g} (${GATE_NAMES_RU[g] ?? g})`).join(", ");
  const crossAngleRu = CROSS_ANGLE_NAMES_RU[chart.cross.angle];
  const crossRu = crossNameRu(chart);
  const crossGateNumbers = [...chart.cross.gates];

  const contractBlock = [
    "КОНТРАКТ СОГЛАСОВАННОСТИ (данные движка — НЕ пересчитывай и НЕ оспаривай):",
    formatHdBirthIdentity(chart, opts),
    `Тип = ${meta.nameRu}.`,
    `Стратегия = ${meta.strategyRu}.`,
    `Авторитет = ${AUTHORITY_NAMES_RU[chart.authority]}.`,
    `Подпись = ${meta.signatureRu}.`,
    `Не-я / ложное «я» = ${meta.notSelfRu}.`,
    `Профиль = ${chart.profile} (${PROFILE_NAMES_RU[chart.profile] ?? chart.profile}).`,
    `Определённость = ${DEFINITION_NAMES_RU[chart.definition] ?? chart.definition}.`,
    `Угол инкарнационного креста = ${crossAngleRu}.`,
    `Название инкарнационного креста = «${crossRu}» (ворота ${crossGateNumbers.join("/")}).`,
    `Определённые центры: ${definedCentersRu.join(", ") || "нет"}.`,
    `Открытые центры: ${openCentersRu.join(", ") || "нет"}.`,
    `Моторные среди определённых: ${motorCentersDefinedRu.join(", ") || "нет"} (число=${motorCentersDefinedRu.length}).`,
    `Висячие ворота (единый список): ${hangingGatesRu}.`,
    `Определённые каналы:`,
    ...definedChannels.map((l) => `- ${l}`),
    "Запрещено выводить тип/стратегию/авторитет/профиль/угол креста заново.",
    "Запрещено писать неверное число моторных центров.",
    "Не называй висящими ворота из определённых каналов или из креста, если их нет в списке висячих.",
  ].join("\n");

  return {
    typeKey: chart.type,
    typeRu: meta.nameRu,
    strategyRu: meta.strategyRu,
    strategyKeywords: strat.keywords,
    foreignStrategyPatterns: strat.foreign,
    signatureRu: meta.signatureRu,
    notSelfRu: meta.notSelfRu,
    authorityRu: AUTHORITY_NAMES_RU[chart.authority],
    profile: chart.profile,
    profileRu: PROFILE_NAMES_RU[chart.profile] ?? chart.profile,
    definitionRu: DEFINITION_NAMES_RU[chart.definition] ?? chart.definition,
    crossAngleKey: chart.cross.angle,
    crossAngleRu,
    crossAngleAliases: angleAliases(chart.cross.angle, crossAngleRu),
    crossNameRu: crossRu,
    definedCentersRu,
    openCentersRu,
    definedChannels,
    definedChannelKeys,
    motorCentersDefinedRu,
    hangingGateNumbers: hang,
    hangingGatesRu,
    crossGateNumbers,
    contractBlock,
  };
}
