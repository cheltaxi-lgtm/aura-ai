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
 * Maps engine result onto the octagram. Maternal energy is B+C = top-right vertex.
 * Paternal (A+C) is the extra male-line head. BC / CG / GA come from the age belt.
 */
export function buildMatrixSemanticModel(
  matrix: DestinyMatrixResult
): MatrixSemanticModel {
  const topRight = ageAt(matrix, 30);
  const bottomRight = ageAt(matrix, 50);
  const bottomLeft = ageAt(matrix, 70);

  const nodes: MatrixSemanticNode[] = [
    node("outer.left", "outer", "Характер", "Характер", matrix.body, "body", ["body"]),
    node("outer.topLeft", "outer", "Таланты", "Таланты", matrix.talents, "talents", ["talents"]),
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
      "Род · низ справа",
      "Род",
      bottomRight,
      null,
      []
    ),
    node("outer.bottom", "outer", "Кармический хвост · корень", "Земля", matrix.karma, "karma", [
      "karma",
    ]),
    node(
      "outer.bottomLeft",
      "outer",
      "Род · низ слева",
      "Род",
      bottomLeft,
      null,
      []
    ),
    node("center", "center", "Зона комфорта", "Центр", matrix.comfort, "purpose", [
      "purpose",
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
    node(
      "maleLine.head",
      "lineage",
      "Род отца",
      "Отец",
      matrix.paternal,
      "paternal",
      ["paternal"]
    ),
    node(
      "karmicTail.tip",
      "tail",
      "Кармический хвост · остриё",
      "Хвост",
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
