/**
 * Calculation → semantic Destiny Matrix. Renderer must not recompute formulas.
 */
import {
  DESTINY_MATRIX_DIAGRAM_SLOTS,
  type DestinyMatrixAgePoint,
  type DestinyMatrixPoint,
  type DestinyMatrixResult,
} from "./destiny-matrix";
import type { MatrixLayoutId } from "./matrix-layout";

export type MatrixNodeRole =
  | "outer"
  | "center"
  | "axis"
  | "lineage"
  | "tail"
  | "period";

export type MatrixSemanticNode = {
  id: MatrixLayoutId;
  role: MatrixNodeRole;
  label: string;
  shortLabel: string;
  number: number;
  arcanaName: string;
  /** Index in DESTINY_MATRIX_DIAGRAM_SLOTS, or -1 if structure-only. */
  revealIndex: number;
  focusKeys: string[];
};

export type MatrixSemanticAgeMark = DestinyMatrixAgePoint & {
  current: boolean;
};

export type MatrixSemanticModel = {
  calculationVersion: string;
  methodologyId: string;
  nodes: MatrixSemanticNode[];
  ageMarks: MatrixSemanticAgeMark[];
  focusKey: string;
  focusLabel: string;
  asOf: DestinyMatrixResult["asOf"];
};

const SLOT_INDEX = new Map(
  DESTINY_MATRIX_DIAGRAM_SLOTS.map((slot, i) => [String(slot.key), i])
);

function ageAt(
  matrix: DestinyMatrixResult,
  age: number
): DestinyMatrixPoint {
  const hit = matrix.agePoints.find((p) => p.age === age);
  return hit ?? matrix.body;
}

function node(
  id: MatrixLayoutId,
  role: MatrixNodeRole,
  label: string,
  shortLabel: string,
  point: DestinyMatrixPoint,
  slotKey: string | null,
  focusKeys: string[]
): MatrixSemanticNode {
  return {
    id,
    role,
    label,
    shortLabel,
    number: point.number,
    arcanaName: point.arcanaName,
    revealIndex: slotKey ? (SLOT_INDEX.get(slotKey) ?? -1) : -1,
    focusKeys,
  };
}

/**
 * Maps engine result onto the octagram. Renderer must not invent numbers.
 * v4: paternal = C+G at bottom-right. v3: paternal stays on maleLine.head (A+C).
 */
export function buildMatrixSemanticModel(
  matrix: DestinyMatrixResult
): MatrixSemanticModel {
  const base = matrix.calculationVersion.split("@")[0];
  const isV3 = base === "matrix-v3";
  const isV5 = base === "matrix-v5";
  const topRight = isV3 ? matrix.maternal : ageAt(matrix, 30);
  const bottomRight = isV3 ? ageAt(matrix, 50) : matrix.paternal;
  const bottomLeft = isV5
    ? (matrix.lineage?.female[2] ?? ageAt(matrix, 70))
    : ageAt(matrix, 70);
  const topLeftPoint = isV5
    ? (matrix.lineage?.male[0] ?? matrix.talents)
    : matrix.talents;
  const topLeftLabel = isV5 ? "Род отца · духовное" : "Таланты";

  const nodes: MatrixSemanticNode[] = [
    node("outer.left", "outer", "Характер", "Характер", matrix.body, "body", ["body"]),
    node("outer.topLeft", "outer", topLeftLabel, isV5 ? "Отец" : "", topLeftPoint, isV5 ? null : "talents", isV5 ? ["paternal"] : ["talents"]),
    node("outer.top", "outer", "Небо / энергия", "Небо", matrix.energy, "energy", ["energy"]),
    node(
      "outer.topRight",
      "outer",
      "Род матери",
      "Мать",
      topRight,
      "maternal",
      ["maternal"]
    ),
    node("outer.right", "outer", "Материя / год", "Материя", matrix.roots, "roots", ["roots"]),
    node(
      "outer.bottomRight",
      "outer",
      isV3 ? "Родовая точка · 50 лет" : "Род отца",
      isV3 ? "" : "Отец",
      bottomRight,
      isV3 ? null : "paternal",
      isV3 ? [] : ["paternal"]
    ),
    node("outer.bottom", "outer", "Кармический хвост · корень", "", matrix.karma, "karma", [
      "karma",
    ]),
    node(
      "outer.bottomLeft",
      "outer",
      isV5 ? "Род матери · материальное" : "Родовая точка · 70 лет",
      isV5 ? "Мать" : "",
      bottomLeft,
      isV5 ? "maternal" : null,
      isV5 ? ["maternal"] : []
    ),
    node("center", "center", "Зона комфорта", "", matrix.comfort, "comfort", [
      "comfort",
    ]),
    node("vertical.top", "axis", "Духовный полюс", "Дух", matrix.skySpirit, "skySpirit", [
      "skySpirit",
    ]),
    node(
      "vertical.bottom",
      "axis",
      "Кармический хвост · середина",
      "Задача",
      matrix.earthTask,
      "karmicMid",
      ["karmicMid"]
    ),
    node(
      "horizontal.left",
      "axis",
      "Отношения",
      "Любовь",
      matrix.relationships,
      "relationships",
      ["relationships"]
    ),
    node("horizontal.right", "axis", "Деньги", "Деньги", matrix.money, "money", ["money"]),
    ...(isV3
      ? [
          node(
            "maleLine.head",
            "lineage",
            "Род отца",
            "Отец",
            matrix.paternal,
            "paternal",
            ["paternal"]
          ),
        ]
      : []),
    node(
      "karmicTail.tip",
      "tail",
      "Кармический хвост · остриё",
      "",
      matrix.karmicTail[2],
      "karmicTip",
      ["karmicTip"]
    ),
    node("period.year", "period", "Аркан года", "Год", matrix.yearArcana, "yearArcana", [
      "yearArcana",
    ]),
    node("period.month", "period", "Аркан месяца", "Месяц", matrix.monthArcana, "monthArcana", [
      "monthArcana",
    ]),
  ];

  const ageMarks: MatrixSemanticAgeMark[] = matrix.agePoints
    .filter((p) => p.age < 80)
    .map((p) => ({
      ...p,
      current: p.age === matrix.ageCurrent.age,
    }));

  return {
    calculationVersion: matrix.calculationVersion,
    methodologyId: matrix.methodologyId,
    nodes,
    ageMarks,
    focusKey: matrix.focusKey,
    focusLabel: matrix.focusLabel,
    asOf: matrix.asOf,
  };
}

export function matrixNodeById(
  model: MatrixSemanticModel,
  id: MatrixLayoutId
): MatrixSemanticNode | undefined {
  return model.nodes.find((n) => n.id === id);
}

export function isNodeFocused(node: MatrixSemanticNode, focusKey: string): boolean {
  return node.focusKeys.includes(focusKey);
}
