"use client";

import DestinyMatrixDiagram, {
  DESTINY_MATRIX_UI_SLOT_COUNT,
  type DestinyMatrixDiagramProps,
} from "./DestinyMatrixDiagram";

export { DESTINY_MATRIX_UI_SLOT_COUNT };

export type DestinyMatrixGridProps = DestinyMatrixDiagramProps;

/** Canonical Matrix surface — kept as the historical import name. */
export default function DestinyMatrixGrid(props: DestinyMatrixGridProps) {
  return <DestinyMatrixDiagram {...props} />;
}
