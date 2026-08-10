"use client";

import dynamic from "next/dynamic";
import { DESTINY_MATRIX_UI_SLOT_COUNT } from "@/components/numerolog/DestinyMatrixGrid";

const NatalChartWheel = dynamic(
  () => import("@/components/natal/NatalChartWheel"),
  { ssr: false }
);
const DestinyMatrixGrid = dynamic(
  () => import("@/components/numerolog/DestinyMatrixGrid"),
  { ssr: false }
);
const Bodygraph = dynamic(
  () => import("@/components/human-design/Bodygraph"),
  { ssr: false }
);

export type ChartSnapshot = {
  caseType?: string;
  western?: Record<string, unknown> | null;
  timeKnown?: boolean;
  matrix?: any;
  hdChart?: any;
};

export default function ProResultCharts({
  snapshot,
  size = 340,
}: {
  snapshot: ChartSnapshot | null | undefined;
  size?: number;
}) {
  if (!snapshot) return null;
  if (snapshot.western) {
    return (
      <div className="pro-result-chart flex justify-center py-4">
        <NatalChartWheel
          western={snapshot.western}
          timeKnown={Boolean(snapshot.timeKnown)}
          size={size}
        />
      </div>
    );
  }
  if (snapshot.matrix) {
    return (
      <div className="pro-result-chart pro-result-chart--matrix flex justify-center py-6">
        <div className="pro-result-chart__frame w-full max-w-md">
          <DestinyMatrixGrid
            matrix={snapshot.matrix}
            revealed={DESTINY_MATRIX_UI_SLOT_COUNT}
          />
        </div>
      </div>
    );
  }
  if (snapshot.hdChart) {
    return (
      <div className="pro-result-chart pro-result-chart--hd flex justify-center py-6">
        <Bodygraph chart={snapshot.hdChart} />
      </div>
    );
  }
  return null;
}
