"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import BodyPortal from "@/components/BodyPortal";
import { clearAuthPending } from "@/lib/auth-pending";
import { clearClientAuthState } from "@/lib/client-logout";
import { flushWebViewCookies } from "@/lib/webview-cookies";
import {
  homeUrlAfterAccountDeletion,
  markAccountDeletedHome,
} from "@/lib/account-deleted";

interface Props {
  onDeleted?: () => void | Promise<void>;
}

/**
 * After successful DELETE /api/user/delete:
 * clear client state and hard-navigate to guest homepage.
 * Must NOT dispatch AUTH_LOGOUT_EVENT / setState before navigation — cabinet's
 * `!authUser` effect would otherwise router.replace → /auth/user/login.
 */
function leaveToHomeAfterAccountDeletion(): void {
  const target = homeUrlAfterAccountDeletion();
  markAccountDeletedHome();
  clearAuthPending();
  clearClientAuthState();
  // Hard document navigation — do not use Next router / AUTH_LOGOUT_EVENT.
  window.location.replace(target);
  // Absolute fallback if replace is swallowed by the SPA.
  window.setTimeout(() => {
    if (
      window.location.pathname.startsWith("/cabinet") ||
      window.location.pathname.startsWith("/auth/")
    ) {
      window.location.href = target;
    }
  }, 250);
}

export default function CabinetDeleteAccount({ onDeleted }: Props) {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = acknowledged && !deleting;

  const resetForm = useCallback(() => {
    setAcknowledged(false);
    setError(null);
  }, []);

  const closeModal = useCallback(() => {
    if (deleting) return;
    setOpen(false);
    resetForm();
  }, [deleting, resetForm]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, closeModal]);

  const handleDelete = async () => {
    if (!canSubmit) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/user/delete", {
        method: "DELETE",
        credentials: "include",
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(
          payload.message ??
            (payload.error === "rate_limit"
              ? "Слишком частые попытки. Попробуйте позже."
              : "Не удалось удалить аккаунт.")
        );
      }

      // Flag + hard-nav MUST run synchronously after success.
      // Cookie is already cleared; any /me 401 can null authUser and cabinet
      // would otherwise router.replace → login before we leave.
      markAccountDeletedHome();
      leaveToHomeAfterAccountDeletion();
      void flushWebViewCookies().catch(() => undefined);
      void Promise.resolve(onDeleted?.()).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка удаления");
      setDeleting(false);
    }
  };

  return (
    <>
      <section
        id="cabinet-delete-account"
        className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] px-4 py-3.5"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-100/90">Удалить аккаунт целиком</p>
            <p className="mt-0.5 text-xs text-red-200/50">
              Безвозвратно: профиль, руны, история и память ИИ
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="cabinet-btn cabinet-btn--danger shrink-0"
          >
            Удалить
          </button>
        </div>
      </section>

      <BodyPortal active={open}>
        <AnimatePresence>
          {open ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="app-modal-overlay fixed inset-0 z-[4990] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm pointer-events-auto"
              onClick={closeModal}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="cabinet-delete-account-title"
                onClick={(e) => e.stopPropagation()}
                className="max-h-[min(90dvh,calc(100dvh-2rem))] w-full max-w-md overflow-y-auto rounded-2xl border border-red-500/25 bg-[#140a0a] shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
              >
                <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-red-500/15 bg-[#140a0a]/95 px-5 py-4 backdrop-blur-sm">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden />
                    <div>
                      <h2 id="cabinet-delete-account-title" className="text-lg font-semibold text-red-100">
                        Удалить аккаунт?
                      </h2>
                      <p className="mt-1 text-sm text-red-200/70">Действие необратимо</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={deleting}
                    aria-label="Закрыть"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/50 transition-colors hover:text-white disabled:opacity-40"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-4 px-5 py-4">
                  <p className="text-sm text-red-200/80">
                    Вы уверены? Это действие необратимо. Все ваши руны, история раскладов и память
                    ИИ будут безвозвратно удалены из базы данных согласно 152-ФЗ.
                  </p>

                  <label className="flex cursor-pointer items-start gap-2 text-sm text-red-100/90">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-red-400/50 bg-transparent"
                    />
                    <span>Я понимаю, что восстановить аккаунт и данные будет невозможно.</span>
                  </label>

                  {error ? (
                    <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                      {error}
                    </p>
                  ) : null}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={closeModal}
                      disabled={deleting}
                      className="cabinet-btn cabinet-btn--secondary flex-1 disabled:opacity-40"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      disabled={!canSubmit}
                      onClick={() => void handleDelete()}
                      className="cabinet-btn cabinet-btn--danger inline-flex flex-1 items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {deleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden />
                      )}
                      {deleting ? "Удаляю…" : "Удалить аккаунт"}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </BodyPortal>
    </>
  );
}
