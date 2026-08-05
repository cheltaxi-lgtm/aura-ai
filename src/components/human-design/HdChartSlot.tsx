"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Hard remount gate: unmount children for one frame so canvases/SVG/motion
 * from the previous chart cannot remain painted on screen.
 */
export default function HdChartSlot({
  slotKey,
  children,
}: {
  slotKey: string;
  children: ReactNode;
}) {
  const [readyKey, setReadyKey] = useState<string | null>(null);

  useEffect(() => {
    setReadyKey(null);
    // Exit any leftover fullscreen bodygraph from the previous mount.
    document.body.style.overflow = "";
    document.querySelectorAll(".hd-bodygraph.is-fullscreen").forEach((el) => {
      el.classList.remove("is-fullscreen");
    });
    // Two frames: commit the empty state, then mount the next chart.
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setReadyKey(slotKey));
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, [slotKey]);

  if (readyKey !== slotKey) {
    return (
      <p className="py-8 text-center text-sm text-white/40" aria-live="polite">
        Обновляем карту…
      </p>
    );
  }

  return <div key={slotKey}>{children}</div>;
}
