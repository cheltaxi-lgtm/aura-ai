"use client";

import NatalChartWheel from "@/components/natal/NatalChartWheel";
import HdStaticBodygraph from "@/components/human-design/HdStaticBodygraph";
import { buildMatrixDiagramSvgFromResult } from "@/lib/numerology/matrix-diagram-svg";
import type { ChartSnapshot } from "@/modules/pro/ui/ProResultCharts";

/** Synchronous chart imports: the document cannot become ready before its SVG. */
export default function ReportCharts({ snapshot }: { snapshot: ChartSnapshot | null | undefined }) {
  if (!snapshot) return null;
  if (snapshot.western) return <figure className="report-document__visual report-document__natal">
    <NatalChartWheel western={snapshot.western} timeKnown={Boolean(snapshot.timeKnown)} size={580} />
    <figcaption>Натальная карта · сохранённые данные</figcaption>
  </figure>;
  if (snapshot.matrix) return <figure className="report-document__visual" dangerouslySetInnerHTML={{ __html:
    buildMatrixDiagramSvgFromResult(snapshot.matrix, { theme: "print", density: "full", uid: "pdf-matrix" }) }} />;
  if (snapshot.hdChart) return <figure className="report-document__visual"><HdStaticBodygraph chart={snapshot.hdChart} theme="light" idPrefix="pdf-hd" /><figcaption>Бодиграф · ваша карта</figcaption></figure>;
  return null;
}
