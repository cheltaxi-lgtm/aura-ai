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
    methodologySource: "zovus-matrix-22-v1 horizontal relations–money axis",
    rendererPathIds: ["outer.left", "horizontal.left", "center", "horizontal.right"],
  },
  {
    id: "money",
    label: MATRIX_LABELS.moneyChannel,
    pointIds: ["skySpirit", "comfort", "money", "earthTask"],
    methodologySource: "zovus-matrix-22-v1 sky–center–money–earth contour",
    rendererPathIds: ["vertical.top", "center", "horizontal.right", "vertical.bottom"],
  },
  {
    id: "male",
    label: MATRIX_LABELS.maleChannel,
    pointIds: ["body", "lineage.ga", "paternal", "roots"],
    methodologySource: "zovus-matrix-22-v1 ancestral square lower edge + A/C",
    rendererPathIds: ["outer.left", "outer.bottomLeft", "outer.bottomRight", "outer.right"],
  },
  {
    id: "female",
    label: MATRIX_LABELS.femaleChannel,
    pointIds: ["talents", "energy", "maternal"],
    methodologySource: "zovus-matrix-22-v1 ancestral square upper edge",
    rendererPathIds: ["outer.topLeft", "outer.top", "outer.topRight"],
  },
  {
    id: "skyEarth",
    label: MATRIX_LABELS.skyEarthChannel,
    pointIds: ["energy", "skySpirit", "comfort", "earthTask", "karma"],
    methodologySource: "zovus-matrix-22-v1 vertical sky–earth axis",
    rendererPathIds: ["outer.top", "vertical.top", "center", "vertical.bottom", "outer.bottom"],
  },
  {
    id: "karmicTail",
    label: "Кармический хвост",
    pointIds: ["earthTask", "karma", "karmicTip"],
    methodologySource: "zovus-matrix-22-v1 three-point tail",
    rendererPathIds: ["vertical.bottom", "outer.bottom", "karmicTail.tip"],
  },
];
