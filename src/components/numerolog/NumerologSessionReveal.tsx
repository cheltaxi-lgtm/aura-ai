"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { NumerologSessionResult } from "@/lib/numerology/session-result";
import PythagorasSquareGrid from "@/components/PythagorasSquareGrid";
import DestinyMatrixGrid from "@/components/numerolog/DestinyMatrixGrid";

interface NumerologSessionRevealProps {
  result: NumerologSessionResult;
  onAllRevealed?: () => void;
}

export default function NumerologSessionReveal({ result, onAllRevealed }: NumerologSessionRevealProps) {
  const totalSteps = result.pythagorasSquare ? 1 : result.positions.length;
  const [revealed, setRevealed] = useState(0);
  const onAllRevealedRef = useRef(onAllRevealed);
  onAllRevealedRef.current = onAllRevealed;

  useEffect(() => {
    setRevealed(0);
  }, [result.toolId]);

  useEffect(() => {
    if (totalSteps === 0) {
      onAllRevealedRef.current?.();
      return;
    }
    if (revealed >= totalSteps) {
      onAllRevealedRef.current?.();
      return;
    }
    const delay = result.pythagorasSquare ? 600 : revealed === 0 ? 120 : 480 + revealed * 520;
    const timer = window.setTimeout(() => setRevealed((n) => n + 1), delay);
    return () => window.clearTimeout(timer);
  }, [revealed, totalSteps, result.pythagorasSquare, result.toolId]);

  const isForecast = result.toolId === "forecast_9y";
  const isCompat = result.toolId === "compatibility";
  const isMatrix = result.toolId === "destiny_matrix" && result.destinyMatrix;

  if (!result.pythagorasSquare && result.positions.length === 0) {
    return (
      <div className="numerolog-reveal mx-auto w-full max-w-lg text-center">
        <div className="numerolog-reveal__head">
          <p className="numerolog-reveal__eyebrow">Ваш расчёт</p>
          <h3 className="numerolog-reveal__title">{result.title}</h3>
          <p className="numerolog-reveal__subtitle">{result.subtitle}</p>
        </div>
        <p className="mt-6 text-sm text-red-300">
          Не удалось построить позиции расчёта — проверьте дату рождения в профиле.
        </p>
      </div>
    );
  }

  return (
    <div className={`numerolog-reveal mx-auto w-full ${isMatrix ? "max-w-md" : "max-w-lg"}`}>
      <div className="numerolog-reveal__head">
        <p className="numerolog-reveal__eyebrow">Ваш расчёт</p>
        <h3 className="numerolog-reveal__title">{result.title}</h3>
        <p className="numerolog-reveal__subtitle">{result.subtitle}</p>
      </div>

      {result.pythagorasSquare ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={revealed >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: 0.45 }}
        >
          <PythagorasSquareGrid square={result.pythagorasSquare} className="mt-4" />
          <p className="mt-3 text-center text-xs leading-relaxed text-white/45">
            Каждая ячейка — количество соответствующих цифр в дате рождения. Эвелина расшифрует матрицу в
            сеансе.
          </p>
        </motion.div>
      ) : isMatrix ? (
        <DestinyMatrixGrid matrix={result.destinyMatrix!} revealed={revealed} />
      ) : (
        <div
          className={`numerolog-reveal__grid ${isForecast ? "numerolog-reveal__grid--timeline" : ""} ${isCompat ? "numerolog-reveal__grid--compat" : ""}`}
        >
          {result.positions.map((pos, i) => {
            const visible = i < revealed;
            return (
              <motion.div
                key={`${pos.label}-${i}`}
                className={`numerolog-reveal__cell ${visible ? "numerolog-reveal__cell--visible" : ""}`}
                initial={{ opacity: 0, scale: 0.92, y: 12 }}
                animate={visible ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.92, y: 12 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
              >
                <p className="numerolog-reveal__label">{pos.label}</p>
                <p className="numerolog-reveal__value">{pos.value}</p>
                {pos.detail ? <p className="numerolog-reveal__detail">{pos.detail}</p> : null}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
