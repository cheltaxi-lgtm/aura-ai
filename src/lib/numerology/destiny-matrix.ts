import { computeDestinyMatrixV3 } from "./destiny-matrix-v3";
import { computeDestinyMatrixV4 } from "./destiny-matrix-v4";
import { computeDestinyMatrixV5 } from "./destiny-matrix-v5";
import { AGE_BELT_END } from "./destiny-matrix-internal";
import { arcanaForNumber } from "./matrix-arcana-map";
import { formatAgePeriodLabel, MATRIX_LABELS } from "./matrix-labels";
import { reduceToArcanaNumber } from "./matrix-reducers";
import {
  MATRIX_CALCULATION_VERSION,
  matrixBaseVersion,
  type DestinyMatrixOptions,
  type DestinyMatrixPoint,
  type DestinyMatrixResult,
} from "./matrix-result";

export { AGE_BELT_END };
export {
  MATRIX_CALCULATION_VERSION,
  MATRIX_LEGACY_CALCULATION_VERSIONS,
  MATRIX_METHODOLOGY_ID,
  MATRIX_RENDERER_VERSION,
  MATRIX_V3_CALCULATION_VERSION,
  MATRIX_V3_METHODOLOGY_ID,
  MATRIX_V4_CALCULATION_VERSION,
  MATRIX_V4_METHODOLOGY_ID,
  MATRIX_V3_RENDERER_VERSION,
  MATRIX_V4_RENDERER_VERSION,
  MATRIX_V5_RENDERER_VERSION,
  MATRIX_V5_ENGINE_FINGERPRINT,
  DESTINY_MATRIX_POINT_KEYS,
  classifyMatrixReportVersion,
  isFrozenReplayVersion,
  isKnownMatrixCalculationVersion,
  isLegacyMatrixCalculationVersion,
  methodologyIdForCalculationVersion,
  matrixBaseVersion,
} from "./matrix-result";
export type {
  DestinyMatrixAgeModel,
  DestinyMatrixAgePoint,
  DestinyMatrixChannel,
  DestinyMatrixChannelId,
  DestinyMatrixLineage,
  DestinyMatrixOptions,
  DestinyMatrixPoint,
  DestinyMatrixPurposeBlock,
  DestinyMatrixResult,
  DestinyMatrixTalentChain,
  MatrixDisplayResolution,
  MatrixEngineVersion,
  MatrixMethodologyId,
  MatrixResolveError,
} from "./matrix-result";
export { reduceToArcanaNumber, reduceToArcanaDigitSum, reduceToArcanaSubtract22 } from "./matrix-reducers";
export { arcanaForNumber, getMatrixArcanaEntry, MATRIX_ARCANA_DICTIONARY } from "./matrix-arcana-map";

export function destinyMatrix(
  birthDate: string,
  options?: DestinyMatrixOptions
): DestinyMatrixResult | null {
  const requested = matrixBaseVersion(options?.calculationVersion);
  if (!requested) return computeDestinyMatrixV5(birthDate, options);
  if (requested === "matrix-v5") return computeDestinyMatrixV5(birthDate, options);
  if (requested === "matrix-v4") return computeDestinyMatrixV4(birthDate, options);
  if (requested === "matrix-v3") return computeDestinyMatrixV3(birthDate, options);
  return null;
}

export const DESTINY_MATRIX_DIAGRAM_SLOTS: Array<{
  key: keyof DestinyMatrixResult | "karmicMid" | "karmicTip" | "ageCurrent" | "monthArcana" | "skySpirit";
  label: string;
  area: string;
  featured?: boolean;
  pick: (m: DestinyMatrixResult) => DestinyMatrixPoint;
}> = [
  { key: "energy", label: MATRIX_LABELS.energyLong, area: "energy", pick: (m) => m.energy },
  { key: "skySpirit", label: MATRIX_LABELS.skySpirit, area: "sky", pick: (m) => m.skySpirit },
  { key: "body", label: MATRIX_LABELS.body, area: "body", pick: (m) => m.body },
  {
    key: "purpose",
    label: MATRIX_LABELS.comfort,
    area: "purpose",
    featured: true,
    pick: (m) => m.comfort,
  },
  { key: "roots", label: MATRIX_LABELS.rootsLong, area: "roots", pick: (m) => m.roots },
  { key: "talents", label: MATRIX_LABELS.talents, area: "talents", pick: (m) => m.talents },
  { key: "relationships", label: MATRIX_LABELS.relationships, area: "rel", pick: (m) => m.relationships },
  { key: "money", label: MATRIX_LABELS.money, area: "money", pick: (m) => m.money },
  { key: "paternal", label: MATRIX_LABELS.paternal, area: "paternal", pick: (m) => m.paternal },
  { key: "maternal", label: MATRIX_LABELS.maternal, area: "maternal", pick: (m) => m.maternal },
  { key: "karma", label: MATRIX_LABELS.karma, area: "karma", pick: (m) => m.karmicTail[0] },
  { key: "karmicMid", label: MATRIX_LABELS.karmicMid, area: "tailMid", pick: (m) => m.karmicTail[1] },
  { key: "karmicTip", label: MATRIX_LABELS.karmicTip, area: "tailTip", pick: (m) => m.karmicTail[2] },
  {
    key: "ageCurrent",
    label: MATRIX_LABELS.agePeriod,
    area: "age",
    pick: (m) => arcanaForNumber(m.ageCurrent.number, m.calculationVersion),
  },
  { key: "yearArcana", label: MATRIX_LABELS.yearArcana, area: "year", pick: (m) => m.yearArcana },
  { key: "monthArcana", label: MATRIX_LABELS.monthArcana, area: "month", pick: (m) => m.monthArcana },
];

export const DESTINY_MATRIX_UI_SLOT_COUNT = DESTINY_MATRIX_DIAGRAM_SLOTS.length;

export function matrixOptionsForTimestamp(
  timestamp: string | null | undefined
): DestinyMatrixOptions | undefined {
  const day = timestamp?.slice(0, 10);
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? { asOfDate: day } : undefined;
}

export function formatDestinyMatrixAscii(m: DestinyMatrixResult): string {
  const periodEnd = m.ageModel?.periodEnd ?? m.ageNext?.age ?? m.ageCurrent.age + 5;
  const lines = [
    `${MATRIX_LABELS.methodologyName} (${m.calculationVersion}):`,
    `${MATRIX_LABELS.body}: ${m.body.number} — ${m.body.arcanaName}`,
    `${MATRIX_LABELS.energyLong}: ${m.energy.number} — ${m.energy.arcanaName}`,
    `${MATRIX_LABELS.rootsLong}: ${m.roots.number} — ${m.roots.arcanaName}`,
    `${MATRIX_LABELS.comfort}: ${m.comfort.number} — ${m.comfort.arcanaName}`,
    `Кармический хвост: ${m.karmicTail.map((p) => `${p.number} ${p.arcanaName}`).join(" → ")}`,
    `${MATRIX_LABELS.talents}: ${m.talents.number} — ${m.talents.arcanaName}`,
    `${MATRIX_LABELS.relationships}: ${m.relationships.number} — ${m.relationships.arcanaName}`,
    `${MATRIX_LABELS.money}: ${m.money.number} — ${m.money.arcanaName}`,
    `${MATRIX_LABELS.paternal}: ${m.paternal.number} — ${m.paternal.arcanaName}`,
    `${MATRIX_LABELS.maternal}: ${m.maternal.number} — ${m.maternal.arcanaName}`,
    `${formatAgePeriodLabel(m.ageCurrent.age, periodEnd)}: ${m.ageCurrent.number} — ${m.ageCurrent.arcanaName}`,
    `${MATRIX_LABELS.yearArcana}: ${m.yearArcana.number} — ${m.yearArcana.arcanaName}`,
    `${MATRIX_LABELS.monthArcana}: ${m.monthArcana.number} — ${m.monthArcana.arcanaName}`,
    `${m.focusLabel}`,
  ];
  if (m.purposeBlock) {
    lines.splice(
      5,
      0,
      `${MATRIX_LABELS.purposePersonal}: ${m.purposeBlock.personal.number} — ${m.purposeBlock.personal.arcanaName}`,
      `${MATRIX_LABELS.purposeSocial}: ${m.purposeBlock.social.number} — ${m.purposeBlock.social.arcanaName}`,
      `${MATRIX_LABELS.purposeSpiritual}: ${m.purposeBlock.spiritual.number} — ${m.purposeBlock.spiritual.arcanaName}`
    );
  }
  return lines.join("\n");
}

export function matrixToStructuredData(m: DestinyMatrixResult): Record<string, unknown> {
  const point = (p: DestinyMatrixPoint) => ({
    number: p.number,
    arcanaName: p.arcanaName,
    arcanaMeaning: p.arcanaMeaning,
  });
  return {
    methodologyId: m.methodologyId,
    version: m.calculationVersion,
    calculationVersion: m.calculationVersion,
    rendererVersion: m.rendererVersion,
    body: point(m.body),
    energy: point(m.energy),
    roots: point(m.roots),
    purpose: point(m.purpose),
    comfort: point(m.comfort),
    relationships: point(m.relationships),
    money: point(m.money),
    karma: point(m.karma),
    talents: point(m.talents),
    paternal: point(m.paternal),
    maternal: point(m.maternal),
    yearArcana: point(m.yearArcana),
    monthArcana: point(m.monthArcana),
    karmicTail: m.karmicTail.map(point),
    skySpirit: point(m.skySpirit),
    earthTask: point(m.earthTask),
    ageCurrent: m.ageCurrent,
    ageNext: m.ageNext,
    chronologicalAge: m.chronologicalAge,
    agePoints: m.agePoints,
    channels: m.channels.map((ch) => ({
      id: ch.id,
      label: ch.label,
      points: ch.points.map(point),
    })),
    focusKey: m.focusKey,
    focusLabel: m.focusLabel,
    asOf: m.asOf,
    ...(m.purposeBlock
      ? {
          purposeBlock: {
            personal: point(m.purposeBlock.personal),
            social: point(m.purposeBlock.social),
            spiritual: point(m.purposeBlock.spiritual),
            skyLine: point(m.purposeBlock.skyLine),
            earthLine: point(m.purposeBlock.earthLine),
            maleChannel: point(m.purposeBlock.maleChannel),
            femaleChannel: point(m.purposeBlock.femaleChannel),
          },
        }
      : {}),
    ...(m.talentsChain
      ? {
          talentsChain: {
            primary: point(m.talentsChain.primary),
            secondary: point(m.talentsChain.secondary),
            tertiary: point(m.talentsChain.tertiary),
          },
        }
      : {}),
    ...(m.lineage
      ? {
          lineage: {
            male: m.lineage.male.map(point),
            female: m.lineage.female.map(point),
          },
        }
      : {}),
    ...(m.ageModel ? { ageModel: m.ageModel } : {}),
    ...(m.loveDeep ? { loveDeep: point(m.loveDeep) } : {}),
    ...(m.moneyDeep ? { moneyDeep: point(m.moneyDeep) } : {}),
  };
}
