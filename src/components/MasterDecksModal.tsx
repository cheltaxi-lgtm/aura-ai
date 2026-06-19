"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import MasterDecksSection from "@/components/MasterDecksSection";

interface MasterDecksModalProps {
  isOpen: boolean;
  onClose: () => void;
  masters: ShowcaseMaster[];
  onBrowseDeck: (master: ShowcaseMaster) => void;
}

export default function MasterDecksModal({
  isOpen,
  onClose,
  masters,
  onBrowseDeck,
}: MasterDecksModalProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    const logLayout = () => {
      const el = panelRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // #region agent log
      fetch("http://127.0.0.1:7394/ingest/19b6b482-2a3a-42dc-852e-bc41c46f6a24", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f9adef" },
        body: JSON.stringify({
          sessionId: "f9adef",
          runId: "decks-modal-layout",
          hypothesisId: "A",
          location: "MasterDecksModal.tsx:layout",
          message: "modal panel bounds",
          data: {
            left: Math.round(r.left),
            top: Math.round(r.top),
            width: Math.round(r.width),
            height: Math.round(r.height),
            centerOffsetX: Math.round(r.left + r.width / 2 - vw / 2),
            centerOffsetY: Math.round(r.top + r.height / 2 - vh / 2),
            viewportW: vw,
            viewportH: vh,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    };
    requestAnimationFrame(logLayout);
  }, [isOpen]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm"
            aria-hidden
          />
          <div
            className="fixed inset-0 z-[61] flex items-center justify-center p-3 sm:p-4"
            onClick={onClose}
          >
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="master-decks-modal-title"
              initial={{ opacity: 0, scale: 0.97, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 10 }}
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[min(88vh,680px)] w-full max-w-[min(100%,52rem)] flex-col overflow-hidden rounded-xl border border-aura-gold/20 bg-[#0c0a14] shadow-2xl shadow-black/50"
            >
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
                <p className="lux-label text-[10px]">Колоды Aura</p>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Закрыть"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-4">
                <MasterDecksSection
                  masters={masters}
                  onBrowseDeck={onBrowseDeck}
                  embedded
                />
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
