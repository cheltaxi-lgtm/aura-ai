import type { MatrixLayoutId } from "./matrix-layout";
import { MATRIX_LABELS } from "./matrix-labels";

export type MatrixChannelDefinition = {
  id: "love" | "money" | "male" | "female" | "skyEarth" | "karmicTail";
  label: string;
  pointIds: readonly string[];
  methodologySource: string;
  rendererPathIds: readonly MatrixLayoutId[];
};

export const MATRIX_CHANNEL_DEFINITIONS: readonly MatrixChannelDefinition[] = [
  {
    id: "love",
    label: MATRIX_LABELS.loveChannel,
    pointIds: ["body", "relationships", "comfort", "money"],
    methodologySource: "zovus-matrix-22-v2 love ray A → A+X → center; money ray C → C+X",
    rendererPathIds: ["outer.left", "horizontal.left", "center", "horizontal.right"],
  },
  {
    id: "money",
    label: MATRIX_LABELS.moneyChannel,
    pointIds: ["skySpirit", "comfort", "money", "earthTask"],
    methodologySource: "zovus-matrix-22-v2 sky–center–money–earth contour",
    rendererPathIds: ["vertical.top", "center", "horizontal.right", "vertical.bottom"],
  },
  {
    id: "male",
    label: MATRIX_LABELS.maleChannel,
    pointIds: ["lineage.male.0", "lineage.male.1", "lineage.male.2"],
    methodologySource: "zovus-matrix-22-v2 male diagonal F→H (AB → CG)",
    rendererPathIds: ["outer.topLeft", "outer.bottomRight"],
  },
  {
    id: "female",
    label: MATRIX_LABELS.femaleChannel,
    pointIds: ["lineage.female.0", "lineage.female.1", "lineage.female.2"],
    methodologySource: "zovus-matrix-22-v2 female diagonal G→I (BC → GA)",
    rendererPathIds: ["outer.topRight", "outer.bottomLeft"],
  },
  {
    id: "skyEarth",
    label: MATRIX_LABELS.skyEarthChannel,
    pointIds: ["energy", "skySpirit", "comfort", "earthTask", "karma"],
    methodologySource: "zovus-matrix-22-v2 vertical sky–earth axis",
    rendererPathIds: ["outer.top", "vertical.top", "center", "vertical.bottom", "outer.bottom"],
  },
  {
    id: "karmicTail",
    label: "Кармический хвост",
    pointIds: ["earthTask", "karma", "karmicTip"],
    methodologySource: "zovus-matrix-22-v2 three-point karmic tail G → G+X → G+(G+X)",
    rendererPathIds: ["vertical.bottom", "outer.bottom", "karmicTail.tip"],
  },
];
