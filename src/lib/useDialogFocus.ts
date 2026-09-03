"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Keep keyboard navigation inside an open dialog and restore its trigger. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, open: boolean, onClose?: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) ?? []).filter((element) => element.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => {
      const dialog = ref.current;
      if (!dialog) return;
      dialog.tabIndex = -1;
      (focusable()[0] ?? dialog).focus();
    });
    const onKey = (event: KeyboardEvent) => {
      const dialog = ref.current;
      if (!dialog) return;
      const activeDialog = document.activeElement?.closest('[role="dialog"]');
      if (activeDialog && activeDialog !== dialog && !dialog.contains(activeDialog)) return;
      if (event.key === "Escape" && closeRef.current) {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === dialog || document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [open, ref]);
}
