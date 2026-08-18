"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  DESTINY_MATRIX_UI_SLOT_COUNT,
  type DestinyMatrixResult,
} from "@/lib/numerology/destiny-matrix";
import { buildMatrixDiagramSvg } from "@/lib/numerology/matrix-diagram-svg";
import { buildMatrixSemanticModel } from "@/lib/numerology/matrix-semantic-model";

export { DESTINY_MATRIX_UI_SLOT_COUNT };

export type DestinyMatrixDiagramProps = {
  matrix: DestinyMatrixResult;
  revealed?: number;
  hint?: string;
  focusKey?: string | null;
  theme?: "dark" | "print";
  compact?: boolean;
  showPeriod?: boolean;
  showAgeMarks?: boolean;
};

export default function DestinyMatrixDiagram({
  matrix,
  revealed = DESTINY_MATRIX_UI_SLOT_COUNT,
  hint,
  focusKey,
  theme = "dark",
  compact,
  showPeriod,
  showAgeMarks,
}: DestinyMatrixDiagramProps) {
  const uid = useId().replace(/:/g, "");
  const reduceMotion = useReducedMotion();
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    if (compact != null) return;
    const mq = window.matchMedia("(max-width: 420px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [compact]);

  const density = compact === true || (compact == null && narrow) ? "compact" : "full";
  const model = useMemo(() => buildMatrixSemanticModel(matrix), [matrix]);
  const svg = useMemo(
    () =>
      buildMatrixDiagramSvg(model, {
        theme,
        density,
        revealed: reduceMotion ? 99 : revealed,
        focusKey: focusKey ?? matrix.focusKey,
        showPeriod: showPeriod ?? true,
        showAgeMarks: showAgeMarks ?? true,
        uid,
      }),
    [model, theme, density, revealed, focusKey, matrix.focusKey, showPeriod, showAgeMarks, uid, reduceMotion]
  );

  return (
    <figure className={`destiny-matrix-figure destiny-matrix-figure--${theme} destiny-matrix-figure--${density}`}>
      <div
        className="destiny-matrix-frame"
        role="img"
        aria-label="Матрица судьбы — схема 22 арканов"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <dl className="destiny-matrix-sr">
        {model.nodes.map((node) => (
          <div key={node.id}>
            <dt>{node.label}</dt>
            <dd>
              {node.number} — {node.arcanaName}
            </dd>
          </div>
        ))}
      </dl>
      {density === "compact" ? (
        <ul className="destiny-matrix-legend">
          <li>♥ Отношения</li>
          <li>$ Деньги</li>
          <li>Мужская линия рода</li>
          <li>Женская линия рода</li>
          <li>↓ Кармический хвост</li>
        </ul>
      ) : null}
      {hint ? <figcaption className="destiny-matrix__hint">{hint}</figcaption> : null}
    </figure>
  );
}
