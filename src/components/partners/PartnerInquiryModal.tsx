"use client";

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { CheckCircle2, X } from "lucide-react";
import BodyPortal from "@/components/BodyPortal";
import PartnerInquiryForm from "@/components/partners/PartnerInquiryForm";

export type PartnerInquiryModalProps = {
  open: boolean;
  onClose: () => void;
  /** Element that opened the modal — focus returns here on close. */
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export default function PartnerInquiryModal({
  open,
  onClose,
  returnFocusRef,
}: PartnerInquiryModalProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const handleClose = useCallback(() => {
    if (submitting) return;
    onClose();
    window.setTimeout(() => {
      setSuccess(false);
      setFormKey((k) => k + 1);
      returnFocusRef?.current?.focus();
    }, 0);
  }, [submitting, onClose, returnFocusRef]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 0);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (submitting) return;
      e.preventDefault();
      handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, handleClose]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const list = Array.from(focusable).filter((el) => !el.hasAttribute("disabled"));
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener("keydown", onTab);
    return () => panel.removeEventListener("keydown", onTab);
  }, [open, success]);

  const onOverlayClick = () => {
    if (submitting) return;
    handleClose();
  };

  if (!open) return null;

  return (
    <BodyPortal active={open}>
      <div className="partner-inquiry-modal fixed inset-0 z-[7100] flex items-end justify-center sm:items-center sm:p-4">
        <button
          type="button"
          className="absolute inset-0 bg-black/75 backdrop-blur-sm"
          onClick={onOverlayClick}
          aria-label="Закрыть"
          tabIndex={-1}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          className="partner-inquiry-modal__panel relative z-10 flex w-full max-w-[40rem] flex-col overflow-hidden rounded-t-2xl border border-[rgba(201,162,74,0.18)] bg-[#0c0a12] shadow-2xl sm:max-h-[min(90dvh,calc(100dvh-2rem))] sm:rounded-2xl"
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-5 py-4 pb-[max(1rem,env(safe-area-inset-top,0px))] sm:pb-4">
            <div className="min-w-0 pr-2">
              <h2 id={titleId} className="font-mystic-display text-xl font-medium text-aura-ivory sm:text-2xl">
                {success ? "Заявка отправлена" : "Обсудим вашу колоду"}
              </h2>
              {!success ? (
                <p id={descId} className="mt-1.5 text-sm leading-relaxed text-[rgba(237,230,218,0.62)]">
                  Расскажите о колоде и формате, который вам интересен. Геннадий ответит лично.
                </p>
              ) : (
                <span id={descId} className="sr-only">
                  Заявка успешно отправлена
                </span>
              )}
            </div>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={handleClose}
              disabled={submitting}
              aria-label="Закрыть"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/55 transition-colors hover:text-white disabled:opacity-40"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="lux-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]">
            {success ? (
              <div className="partner-inquiry-modal__success flex flex-col items-center text-center">
                <CheckCircle2
                  className="mb-4 h-12 w-12 text-[rgba(232,199,126,0.85)]"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <h2 className="font-mystic-display text-xl text-aura-ivory">Заявка отправлена</h2>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-[rgba(237,230,218,0.7)]">
                  Спасибо. Геннадий изучит информацию о колоде и свяжется с вами по указанным
                  контактам.
                </p>
                <button
                  type="button"
                  className="editorial-btn editorial-btn--gold mt-6 w-full sm:w-auto"
                  onClick={handleClose}
                >
                  Закрыть
                </button>
              </div>
            ) : (
              <PartnerInquiryForm
                key={formKey}
                onSuccess={() => setSuccess(true)}
                onBusyChange={setSubmitting}
              />
            )}
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
