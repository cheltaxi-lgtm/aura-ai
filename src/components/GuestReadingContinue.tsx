"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Outside the animated result panel so transforms cannot trap the fixed CTA. */
export default function GuestReadingContinue({ onContinue }: { onContinue: () => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [height, setHeight] = useState(128);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const node = bar.current;
    if (!node) return;
    const measure = () => setHeight(node.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [mounted]);
  return <>
    <div aria-hidden style={{ height: "calc(" + height + "px + max(var(--cookie-banner-offset, 0px), var(--guest-continue-nav-offset, 0px)))" }} />
    {mounted ? createPortal(
      <div ref={bar} className="fixed inset-x-0 bottom-0 z-40 border-t border-aura-gold/25 bg-[#111017] px-4 pt-3 shadow-2xl"
        style={{ bottom: "max(var(--cookie-banner-offset, 0px), var(--guest-continue-nav-offset, 0px))", paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto max-w-lg">
          <button type="button" onClick={onContinue} data-guest-cta="full_reading"
            className="btn-primary w-full px-4 py-3.5">
            Получить полный разбор
          </button>
          <p className="mt-2 text-center text-xs text-aura-ivory/70">Бесплатно после регистрации · Эти карты сохранены</p>
        </div>
      </div>, document.body
    ) : null}
  </>;
}
