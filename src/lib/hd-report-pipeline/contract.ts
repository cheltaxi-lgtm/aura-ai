import type { HdChart, HdActivation } from "@/lib/human-design/types";
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
import type { HdTypeKey, HdAuthorityKey, HdCenterKey } from "@/lib/human-design/types";

export type HdLockedContract = {
  ageYears: number | null;
  referenceDate: string;
  typeKey: HdTypeKey;
  authorityKey: HdAuthorityKey;
  definedCenterKeys: HdCenterKey[];
  activeGateNumbers: number[];
  activations: {personality:HdActivation[];design:HdActivation[]};
  timeKnown: boolean;
  stableFields: { type: boolean; authority: boolean; profile: boolean };
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
  /** Connected components of the defined-channel graph, not groups of motors. */
  definitionComponents: HdCenterKey[][];
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
  if (angle === "right") base.push("Правый угол", "прямой угол", "Прямоугольный", "Правоугольный");
  if (angle === "left") base.push("Левый угол", "Левоугольный");
  if (angle === "juxtaposition") base.push("Джукстапозиция", "Juxtaposition", "Джакстапозиционный", "Джукстапозиционный");
  return base;
}

export function buildHdLockedContract(
  chart: HdChart,
  opts?: HdEvidenceOpts
): HdLockedContract {
  const referenceDate = opts?.referenceDate ?? new Date().toISOString().slice(0,10);
  const date = chart.birth?.date;
  const ageYears = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{4}-\d{2}-\d{2}$/.test(referenceDate)
    ? Number(referenceDate.slice(0,4))-Number(date.slice(0,4))-(referenceDate.slice(5)<date.slice(5)?1:0) : null;
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
  const definitionComponents: HdCenterKey[][] = [];
  const remaining = new Set(chart.definedCenters);
  for (const center of chart.definedCenters) {
    if (!remaining.delete(center)) continue;
    const component = [center];
    for (let i = 0; i < component.length; i++) {
      for (const channel of chart.channels.filter(c => c.defined && c.centers.includes(component[i]!))) {
        for (const neighbor of channel.centers) if (remaining.delete(neighbor)) component.push(neighbor);
      }
    }
    definitionComponents.push(component);
  }
  const motorPaths: string[] = [];
  for (const motor of chart.definedCenters.filter(c => MOTOR.has(c))) {
    const queue: {center: HdCenterKey; seen: HdCenterKey[]; text: string}[] = [{center:motor,seen:[motor],text:CENTER_NAMES_RU[motor]}];
    while (queue.length) {
      const path = queue.shift()!;
      if (path.center === "throat") { motorPaths.push(path.text); break; }
      for (const ch of chart.channels.filter(c => c.defined && c.centers.includes(path.center))) {
        const next = ch.centers.find(c => c !== path.center)!;
        if (!path.seen.includes(next)) queue.push({center:next,seen:[...path.seen,next],text:`${path.text} —[${ch.key}]→ ${CENTER_NAMES_RU[next]}`});
      }
    }
  }

  const contractBlock = [
    chart.timeKnown ? "КОНТРАКТ СОГЛАСОВАННОСТИ (данные движка — НЕ пересчитывай):" : "КОНТРАКТ УСЛОВНОЙ КАРТЫ: время неизвестно. Значения ниже относятся к условному моменту, а не к подтверждённой карте человека. Во вступлении и в разделах о нестабильных параметрах явно указывай ограничение. Не выдавай Variables и точную среду за определённые.",
    formatHdBirthIdentity(chart, opts),
    `Дата разбора = ${referenceDate}. Возраст на эту дату = ${ageYears ?? "не установлен"}.`,
    chart.profile.split("/").includes("6")
      ? "Профиль содержит шестую линию. Её возрастные фазы — приблизительные ориентиры около 30 и 50 лет. Не называй фазу после 50 текущей у человека младше 48 и не называй фазу 30–50 текущей после 52. Не обещай конкретные события в заданном возрасте."
      : "Профиль НЕ содержит шестую линию. Не приписывай этому человеку её фазы до 30 / 30–50 / после 50, жизнь «на крыше» или стадию Ролевой модели. При неизвестном времени нельзя придумывать иной возможный профиль с шестой линией. Описывай накопление опыта через фактические линии профиля без возрастного расписания.",
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
    `Группы связанных определённых центров: ${definitionComponents.length}. Это компоненты связности только по определённым каналам.`,
    ...definitionComponents.map((centers, i) => `- Группа ${i + 1}: ${centers.map(c => CENTER_NAMES_RU[c]).join(", ")}; каналы: ${chart.channels.filter(c => c.defined && c.centers.every(center => centers.includes(center))).map(c => c.key).join(", ") || "нет"}.`),
    "В разделе «Определённость и самодостаточность» используй именно эти группы целиком. Не переноси центр в другую группу: соединённые определённым каналом центры всегда принадлежат одной группе. При неизвестном времени это группы условной карты, а не подтверждённая определённость человека.",
    `Пути от определённых моторов к Горловому через определённые каналы: ${motorPaths.join("; ") || "нет"}.`,
    "Каждый канал соединяет только ДВА центра, указанных рядом с ним. Путь через промежуточные центры — цепочка каналов, а не прямой канал. В объяснении типа используй только указанную цепочку; не заменяй её другим каналом.",
    "Ворота обозначаются одним числом, канал — парой ворот. Не называй одиночные ворота каналом: например, ворота 6 — это ворота Трения, а не «канал 6».",
    "Запрещено выводить тип/стратегию/авторитет/профиль/угол креста заново.",
    "Запрещено писать неверное число моторных центров.",
    "Не называй висящими ворота из определённых каналов или из креста, если их нет в списке висячих.",
  ].join("\n");

  return {
    ageYears, referenceDate,
    typeKey: chart.type,
    authorityKey: chart.authority,
    definedCenterKeys: [...chart.definedCenters],
    activeGateNumbers: [...chart.activeGates],
    activations:{personality:chart.personality.map(a=>({...a})),design:chart.designActivations.map(a=>({...a}))},
    timeKnown: chart.timeKnown,
    stableFields: { type: chart.timeKnown || Boolean(chart.stability?.typeStable), authority: chart.timeKnown || Boolean(chart.stability?.authorityStable), profile: chart.timeKnown || Boolean(chart.stability?.profileStable) },
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
    definitionComponents,
    motorCentersDefinedRu,
    hangingGateNumbers: hang,
    hangingGatesRu,
    crossGateNumbers,
    contractBlock,
  };
}
