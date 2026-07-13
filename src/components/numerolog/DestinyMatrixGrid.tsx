"use client";

import { motion } from "framer-motion";
import type { DestinyMatrixPoint, DestinyMatrixResult } from "@/lib/numerology/destiny-matrix";

interface DestinyMatrixGridProps {
  matrix: DestinyMatrixResult;
  revealed: number;
}

type MatrixSlot = {
  key: keyof DestinyMatrixResult;
  label: string;
  area: string;
  featured?: boolean;
};

const MATRIX_SLOTS: MatrixSlot[] = [
  { key: "energy", label: "Энергия", area: "energy" },
  { key: "body", label: "Тело и характер", area: "body" },
  { key: "purpose", label: "Предназначение", area: "purpose", featured: true },
  { key: "roots", label: "Род и корни", area: "roots" },
  { key: "relationships", label: "Отношения", area: "rel" },
  { key: "money", label: "Деньги", area: "money" },
  { key: "karma", label: "Карма", area: "karma" },
];

function MatrixCell({
  point,
  label,
  featured,
  visible,
}: {
  point: DestinyMatrixPoint;
  label: string;
  featured?: boolean;
  visible: boolean;
}) {
  return (
    <motion.div
      className={`destiny-matrix__cell ${featured ? "destiny-matrix__cell--featured" : ""} ${visible ? "destiny-matrix__cell--visible" : ""}`}
      initial={{ opacity: 0, scale: 0.92, y: 12 }}
      animate={visible ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.92, y: 12 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      title={point.arcanaMeaning}
    >
      <p className="destiny-matrix__label">{label}</p>
      <p className="destiny-matrix__number">{point.number}</p>
      <p className="destiny-matrix__name">{point.arcanaName}</p>
    </motion.div>
  );
}

export default function DestinyMatrixGrid({ matrix, revealed }: DestinyMatrixGridProps) {
  return (
    <>
      <div className="destiny-matrix">
        {MATRIX_SLOTS.map((slot, i) => {
          const point = matrix[slot.key];
          return (
            <div key={slot.key} className="destiny-matrix__slot" style={{ gridArea: slot.area }}>
              <MatrixCell
                point={point}
                label={slot.label}
                featured={slot.featured}
                visible={i < revealed}
              />
            </div>
          );
        })}
      </div>
      <p className="destiny-matrix__hint">
        Каждая позиция — аркан 1–22, рассчитанный по дате рождения. Эвелина расшифрует матрицу в сеансе.
      </p>
    </>
  );
}
