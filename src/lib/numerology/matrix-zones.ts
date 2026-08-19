/**
 * Single source of truth for paid destiny-matrix reading zones.
 * Used by completeness gate, sectioned generator, and prompts.
 */
import type { DestinyMatrixResult } from "./destiny-matrix";
import { formatAgeAndPeriodFocus } from "./matrix-labels";
import type { MatrixPointRole } from "./matrix-point-prompt";

export type MatrixZoneId =
  | "character"
  | "sky_energy"
  | "matter"
  | "comfort"
  | "purpose_personal"
  | "purpose_social"
  | "purpose_spiritual"
  | "talents"
  | "money"
  | "love"
  | "father"
  | "mother"
  | "tail_root"
  | "tail_mid"
  | "tail_tip"
  | "age"
  | "age_next"
  | "year"
  | "month"
  | "period"
  | "sky_spirit"
  | "steps"
  | "child_purpose"
  | "parent_role"
  | "child_learning"
  | "child_support";

export type MatrixZoneDef = {
  id: MatrixZoneId;
  /** Exact title line shipped to the client (must match completeness regexes). */
  label: string;
  role: MatrixPointRole | "steps";
  required: boolean;
  /** Regex core (without line anchors) for title detection. */
  titleCore: string;
};

/** Canonical order for the paid full reading. */
export const MATRIX_ZONE_DEFS: MatrixZoneDef[] = [
  {
    id: "character",
    label: "Характер",
    role: "body",
    required: true,
    titleCore: "Характер",
  },
  {
    id: "sky_energy",
    label: "Небо / энергия",
    role: "energy",
    required: true,
    titleCore: String.raw`Небо\s*/\s*энергия`,
  },
  {
    id: "matter",
    label: "Материя / год",
    role: "roots",
    required: true,
    titleCore: String.raw`Материя(?:\s*/\s*год(?:\s+рождения)?)?`,
  },
  {
    id: "comfort",
    label: "Зона комфорта",
    role: "purpose",
    required: true,
    titleCore: String.raw`Зона\s+комфорта`,
  },
  {
    id: "purpose_personal",
    label: "Личное предназначение",
    role: "purpose",
    required: false,
    titleCore: String.raw`Личное\s+предназначение`,
  },
  {
    id: "purpose_social",
    label: "Социальное предназначение",
    role: "purpose",
    required: false,
    titleCore: String.raw`Социальное\s+предназначение`,
  },
  {
    id: "purpose_spiritual",
    label: "Духовное предназначение",
    role: "purpose",
    required: false,
    titleCore: String.raw`Духовное\s+предназначение`,
  },
  {
    id: "talents",
    label: "Таланты",
    role: "talents",
    required: true,
    titleCore: "Таланты",
  },
  {
    id: "money",
    label: "Деньги",
    role: "money",
    required: true,
    titleCore: String.raw`(?:Деньги|Денежный\s+канал)`,
  },
  {
    id: "love",
    label: "Отношения",
    role: "love",
    required: true,
    titleCore: String.raw`(?:Отношения|Канал\s+отношений)`,
  },
  {
    id: "father",
    label: "Род отца",
    role: "paternal",
    required: true,
    titleCore: String.raw`Род\s+(?:отца|по\s+отцу)`,
  },
  {
    id: "mother",
    label: "Род матери",
    role: "maternal",
    required: true,
    titleCore: String.raw`Род\s+(?:матери|по\s+матери)`,
  },
  {
    id: "tail_root",
    label: "Кармический хвост · корень",
    role: "karma",
    required: true,
    titleCore: String.raw`Кармический\s+хвост\s*[·.]\s*корень`,
  },
  {
    id: "tail_mid",
    label: "Кармический хвост · середина",
    role: "karmicMid",
    required: true,
    titleCore: String.raw`Кармический\s+хвост\s*[·.]\s*середина`,
  },
  {
    id: "tail_tip",
    label: "Кармический хвост · остриё",
    role: "karmicTip",
    required: true,
    titleCore: String.raw`Кармический\s+хвост\s*[·.]\s*остри[её]`,
  },
  {
    id: "age",
    label: "Возраст и текущий период",
    role: "age",
    required: true,
    titleCore: String.raw`(?:Возраст\s+и\s+текущий\s+период|Точка\s+возраста(?:\s+сейчас)?)`,
  },
  {
    id: "age_next",
    label: "Ближайший возрастной переход",
    role: "age",
    required: false,
    titleCore: String.raw`Ближайший\s+возрастной\s+переход`,
  },
  {
    id: "year",
    label: "Аркан года",
    role: "year",
    required: true,
    titleCore: String.raw`Аркан\s+года`,
  },
  {
    id: "month",
    label: "Аркан месяца",
    role: "month",
    required: true,
    titleCore: String.raw`Аркан\s+месяца`,
  },
  {
    id: "period",
    label: "Узел периода",
    role: "period",
    required: true,
    titleCore: String.raw`Узел\s+периода`,
  },
  {
    id: "sky_spirit",
    label: "Духовный полюс",
    role: "sky",
    required: true,
    titleCore: String.raw`(?:Духовный\s+полюс|Небо(?:\s*\(натал\))?)`,
  },
  {
    id: "steps",
    label: "Шаги на 30 дней",
    role: "steps",
    required: true,
    titleCore: String.raw`(?:Шаги\s+на\s+30\s+дней|Что\s+делать)`,
  },
];

const CHILD_MATRIX_ZONE_DEFS: MatrixZoneDef[] = [
  ...MATRIX_ZONE_DEFS.filter((zone) =>
    ["character", "sky_energy", "comfort", "talents", "father", "mother", "year", "steps"].includes(zone.id)
  ),
  {
    id: "child_purpose",
    label: "Для чего дан ребёнок",
    role: "purpose",
    required: true,
    titleCore: String.raw`Для\s+чего\s+дан\s+реб[её]нок`,
  },
  {
    id: "parent_role",
    label: "Какой я родитель",
    role: "body",
    required: true,
    titleCore: String.raw`Какой\s+я\s+родитель`,
  },
  {
    id: "child_learning",
    label: "Как учится и мотивируется",
    role: "talents",
    required: true,
    titleCore: String.raw`Как\s+учится\s+и\s+мотивируется`,
  },
  {
    id: "child_support",
    label: "Что поддерживать",
    role: "purpose",
    required: true,
    titleCore: String.raw`Что\s+поддерживать`,
  },
];

const PURPOSE_ZONE_IDS = new Set(["purpose_personal", "purpose_social", "purpose_spiritual"]);

export function matrixZoneDefsFor(toolId?: string, calculationVersion?: string): MatrixZoneDef[] {
  const base = (calculationVersion ?? "").split("@")[0];
  const defs = toolId === "child_matrix" ? CHILD_MATRIX_ZONE_DEFS : MATRIX_ZONE_DEFS;
  if (!base || base === "matrix-v5") {
    return defs.map((def) =>
      PURPOSE_ZONE_IDS.has(def.id) ? { ...def, required: true } : def
    );
  }
  return defs.filter((def) => !PURPOSE_ZONE_IDS.has(def.id));
}

export type MatrixZoneInstance = {
  id: MatrixZoneId;
  label: string;
  role: MatrixPointRole | "steps";
  required: boolean;
  number: number | null;
  arcanaName: string | null;
  age?: number | null;
  focusLabel?: string | null;
};

/** Build concrete zones for a calculated matrix (skips optional when data missing). */
export function listMatrixZones(matrix: DestinyMatrixResult, toolId?: string): MatrixZoneInstance[] {
  const out: MatrixZoneInstance[] = [];

  const pushPoint = (
    def: MatrixZoneDef,
    point: { number: number; arcanaName: string },
    extra?: { age?: number; focusLabel?: string }
  ) => {
    out.push({
      id: def.id,
      label: def.label,
      role: def.role,
      required: def.required,
      number: point.number,
      arcanaName: point.arcanaName,
      age: extra?.age ?? null,
      focusLabel: extra?.focusLabel ?? null,
    });
  };

  for (const def of matrixZoneDefsFor(toolId, matrix.calculationVersion)) {
    switch (def.id) {
      case "character":
        pushPoint(def, matrix.body);
        break;
      case "sky_energy":
        pushPoint(def, matrix.energy);
        break;
      case "matter":
        pushPoint(def, matrix.roots);
        break;
      case "comfort":
        pushPoint(def, matrix.comfort);
        break;
      case "purpose_personal":
        if (matrix.purposeBlock) pushPoint(def, matrix.purposeBlock.personal);
        break;
      case "purpose_social":
        if (matrix.purposeBlock) pushPoint(def, matrix.purposeBlock.social);
        break;
      case "purpose_spiritual":
        if (matrix.purposeBlock) pushPoint(def, matrix.purposeBlock.spiritual);
        break;
      case "talents":
        pushPoint(def, matrix.talents);
        break;
      case "money":
        pushPoint(def, matrix.money);
        break;
      case "love":
        pushPoint(def, matrix.relationships);
        break;
      case "father":
        pushPoint(def, matrix.paternal);
        break;
      case "mother":
        pushPoint(def, matrix.maternal);
        break;
      case "tail_root":
        pushPoint(def, matrix.karmicTail[0]);
        break;
      case "tail_mid":
        pushPoint(def, matrix.karmicTail[1]);
        break;
      case "tail_tip":
        pushPoint(def, matrix.karmicTail[2]);
        break;
      case "age":
        pushPoint(def, matrix.ageCurrent, {
          age: matrix.ageCurrent.age,
          focusLabel: matrix.ageModel
            ? formatAgeAndPeriodFocus({
                chronological: matrix.ageModel.chronological,
                periodStart: matrix.ageModel.periodStart,
                periodEnd: matrix.ageModel.periodEnd,
              })
            : undefined,
        });
        break;
      case "age_next":
        if (matrix.ageNext) {
          pushPoint(def, matrix.ageNext, { age: matrix.ageNext.age });
        }
        break;
      case "year":
        pushPoint(def, matrix.yearArcana);
        break;
      case "month":
        pushPoint(def, matrix.monthArcana);
        break;
      case "period":
        {
          // Must match periodFromMatrix().focusNumber — not year/month fallback.
          const focusN = (() => {
            switch (matrix.focusKey) {
              case "karma":
                return matrix.karmicTail[0].number;
              case "karmicMid":
                return matrix.karmicTail[1].number;
              case "karmicTip":
                return matrix.karmicTail[2].number;
              case "money":
                return matrix.money.number;
              case "relationships":
                return matrix.relationships.number;
              case "ageCurrent":
                return matrix.ageCurrent.number;
              case "purpose":
                return matrix.comfort.number;
              case "yearArcana":
                return matrix.yearArcana.number;
              case "monthArcana":
                return matrix.monthArcana.number;
              default:
                return matrix.purpose.number;
            }
          })();
          const focusPoint =
            [
              matrix.karmicTail[0],
              matrix.karmicTail[1],
              matrix.karmicTail[2],
              matrix.money,
              matrix.relationships,
              matrix.ageCurrent,
              matrix.purpose,
              matrix.yearArcana,
              matrix.monthArcana,
              matrix.body,
            ].find((p) => p.number === focusN) ?? matrix.purpose;
          pushPoint(def, focusPoint, { focusLabel: matrix.focusLabel });
        }
        break;
      case "sky_spirit":
        pushPoint(def, matrix.skySpirit);
        break;
      case "steps":
        out.push({
          id: def.id,
          label: def.label,
          role: "steps",
          required: true,
          number: null,
          arcanaName: null,
          focusLabel: matrix.focusLabel,
        });
        break;
      case "child_purpose":
        pushPoint(def, matrix.purposeBlock?.personal ?? matrix.comfort);
        break;
      case "parent_role":
        pushPoint(def, matrix.body);
        break;
      case "child_learning":
        pushPoint(def, matrix.talents);
        break;
      case "child_support":
        pushPoint(def, matrix.comfort);
        break;
    }
  }

  return out;
}

export function requiredMatrixZoneLabels(toolId?: string, calculationVersion?: string): string[] {
  return matrixZoneDefsFor(toolId, calculationVersion).filter((z) => z.required).map((z) => z.label);
}
