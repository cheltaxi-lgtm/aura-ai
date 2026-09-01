"use client";

import { useEffect, useState } from "react";

import { formatAuraWaitRu } from "@/lib/aura-cadence";

type AuraCadenceHintProps = {
  /** True after today's snapshot exists — show the wait until midnight Moscow. */
  locked: boolean;
};

/**
 * Honest cadence copy. No fake scores. Core stays weeks; layers may shift
 * on a new Moscow day. Same-day reshoot returns the stored snapshot.
 */
export default function AuraCadenceHint({ locked }: AuraCadenceHintProps) {
  const [wait, setWait] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setWait(formatAuraWaitRu());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!locked) {
    return (
      <aside className="aura-cadence">
        <p>
          Один снимок в сутки. Ядро цвета стабильно неделями; слои и чакры могут
          сдвинуться на следующий день.
        </p>
        <p>Снимать чаще не нужно — вернётся тот же результат.</p>
      </aside>
    );
  }

  return (
    <aside className="aura-cadence" role="status">
      <p>
        Новый снимок откроется <strong>{wait ?? "завтра"}</strong> — в 00:00 по Москве.
      </p>
      <p>
        Ядро (основной цвет) не лотерея: в традиции оно держится неделями. За сутки
        меняются слои поля и чакры — это состояние дня.
      </p>
      <p>
        Имеет смысл возвращаться раз в несколько дней. Каждый день — только если
        хотите увидеть сдвиг слоёв, не новый цвет.
      </p>
    </aside>
  );
}
