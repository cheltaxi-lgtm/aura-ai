"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  DESTINY_MATRIX_DIAGRAM_SLOTS,
  DESTINY_MATRIX_UI_SLOT_COUNT,
  type DestinyMatrixPoint,
  type DestinyMatrixResult,
} from "@/lib/numerology/destiny-matrix";

export { DESTINY_MATRIX_UI_SLOT_COUNT };

interface DestinyMatrixGridProps {
  matrix: DestinyMatrixResult;
  revealed: number;
  /** Quieter hint for SEO free preview */
  hint?: string;
  /** Highlight period focus cell */
  focusKey?: string | null;
}

function MatrixCell({
  point,
  label,
  featured,
  visible,
  focused,
  reduceMotion,
}: {
  point: DestinyMatrixPoint;
  label: string;
  featured?: boolean;
  visible: boolean;
  focused?: boolean;
  reduceMotion?: boolean;
}) {
  const ariaLabel = `${label}: ${point.number} — ${point.arcanaName}${
    point.arcanaMeaning ? `. ${point.arcanaMeaning}` : ""
  }`;
  return (
    <motion.div
      role="img"
      aria-label={ariaLabel}
      aria-hidden={!visible}
      className={`destiny-matrix__cell ${featured ? "destiny-matrix__cell--featured" : ""} ${focused ? "destiny-matrix__cell--focus" : ""} ${visible ? "destiny-matrix__cell--visible" : ""}`}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.92, y: 12 }}
      animate={
        visible
          ? { opacity: 1, scale: 1, y: 0 }
          : reduceMotion
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.92, y: 12 }
      }
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 380, damping: 28 }
      }
    >
      <p className="destiny-matrix__label">{label}</p>
      <p className="destiny-matrix__number">{point.number}</p>
      <p className="destiny-matrix__name">{point.arcanaName}</p>
    </motion.div>
  );
}

function slotFocused(slotKey: string, focusKey?: string | null): boolean {
  return Boolean(focusKey) && slotKey === focusKey;
}

export default function DestinyMatrixGrid({
  matrix,
  revealed,
  hint = "Полная матрица Zovus: комфорт, хвост, каналы, возраст и узел периода. Эвелина разберёт каждую зону в сеансе.",
  focusKey,
}: DestinyMatrixGridProps) {
  const reduceMotion = useReducedMotion();
  const activeFocus = focusKey ?? matrix.focusKey;
  return (
    <>
      <div className="destiny-matrix destiny-matrix--v2" role="group" aria-label="Матрица судьбы">
        {DESTINY_MATRIX_DIAGRAM_SLOTS.map((slot, i) => {
          const point = slot.pick(matrix);
          return (
            <div key={slot.key} className="destiny-matrix__slot" style={{ gridArea: slot.area }}>
              <MatrixCell
                point={point}
                label={
                  slot.key === "ageCurrent"
                    ? `${slot.label} (${matrix.ageCurrent.age} лет)`
                    : slot.label
                }
                featured={slot.featured}
                focused={slotFocused(String(slot.key), activeFocus)}
                visible={i < revealed}
                reduceMotion={Boolean(reduceMotion)}
              />
            </div>
          );
        })}
      </div>
      {hint ? <p className="destiny-matrix__hint">{hint}</p> : null}
    </>
  );
}
