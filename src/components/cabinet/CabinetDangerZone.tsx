"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";

const CONFIRM_PHRASE = "УДАЛИТЬ ВСЁ";

interface Props {
  onPurged: () => void | Promise<void>;
}

export default function CabinetDangerZone({ onPurged }: Props) {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [purging, setPurging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = acknowledged && confirmText === CONFIRM_PHRASE && !purging;

  const resetForm = useCallback(() => {
    setAcknowledged(false);
    setConfirmText("");
    setError(null);
  }, []);

  const closeModal = useCallback(() => {
    if (purging) return;
    setOpen(false);
    resetForm();
  }, [purging, resetForm]);

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

  const handlePurge = async () => {
    if (!canSubmit) return;

    const finalOk = window.confirm(
      "Последнее предупреждение: все сеансы, чаты, дневники, обряды и фото-расклады будут удалены безвозвратно. Продолжить?"
    );
    if (!finalOk) return;

    setPurging(true);
    setError(null);
    try {
      const res = await fetch("/api/cabinet/purge", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmPhrase: CONFIRM_PHRASE }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(
          payload.message ??
            (payload.error === "confirm_required"
              ? "Введите фразу подтверждения точно как указано."
              : payload.error === "rate_limit"
                ? "Слишком частые попытки очистки. Попробуйте позже."
                : "Не удалось очистить данные.")
        );
      }
      resetForm();
      setOpen(false);
      await onPurged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка очистки");
    } finally {
      setPurging(false);
    }
  };

  return (
    <>
      <section id="cabinet-danger" className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white/70">Удаление данных</p>
            <p className="mt-0.5 text-xs text-white/40">
              Сеансы, чаты, дневник и обряды — без потери аккаунта и рун
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="cabinet-btn cabinet-btn--danger shrink-0"
          >
            Очистить
          </button>
        </div>
      </section>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
            onClick={closeModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="cabinet-purge-title"
              onClick={(e) => e.stopPropagation()}
              className="max-h-[min(90dvh,calc(100dvh-2rem))] w-full max-w-md overflow-y-auto rounded-2xl border border-red-500/25 bg-[#140a0a] shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
            >
              <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-red-500/15 bg-[#140a0a]/95 px-5 py-4 backdrop-blur-sm">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden />
                  <div>
                    <h2 id="cabinet-purge-title" className="text-lg font-semibold text-red-100">
                      Очистить все данные
                    </h2>
                    <p className="mt-1 text-sm text-red-200/70">
                      Действие необратимо
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={purging}
                  aria-label="Закрыть"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/50 transition-colors hover:text-white disabled:opacity-40"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 px-5 py-4">
                <p className="text-sm text-red-200/80">
                  Безвозвратно удалит всю активность в Zovus: сеансы с мастерами, переписки,
                  фото-расклады, дневник, обряды и уведомления.
                </p>

                <ul className="list-inside list-disc space-y-1 text-sm text-red-100/75">
                  <li>История сеансов и чаты с мастерами</li>
                  <li>Фото-расклады и сохранённые расклады</li>
                  <li>Записи дневника судьбы</li>
                  <li>Обряды и напоминания по ним</li>
                  <li>Память прошлых сеансов</li>
                </ul>

                <p className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-sm text-white/65">
                  <strong className="font-semibold text-white/85">Сохранится:</strong> вход в
                  аккаунт, профиль, баланс рун, достижения и таймер ежедневного расклада.
                </p>

                <label className="flex cursor-pointer items-start gap-2 text-sm text-red-100/90">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-red-400/50 bg-transparent"
                  />
                  <span>Я понимаю, что восстановить удалённые данные будет невозможно.</span>
                </label>

                <div className="space-y-2">
                  <label htmlFor="cabinet-purge-confirm" className="block text-xs text-red-200/70">
                    Введите <span className="font-mono text-red-100">{CONFIRM_PHRASE}</span> для
                    подтверждения
                  </label>
                  <input
                    id="cabinet-purge-confirm"
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={CONFIRM_PHRASE}
                    className="w-full rounded-xl border border-red-500/30 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-red-200/30 focus:border-red-400/60 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                  />
                </div>

                {error ? (
                  <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                    {error}
                  </p>
                ) : null}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={purging}
                    className="cabinet-btn cabinet-btn--secondary flex-1 disabled:opacity-40"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    disabled={!canSubmit}
                    onClick={() => void handlePurge()}
                    className="cabinet-btn cabinet-btn--danger inline-flex flex-1 items-center justify-center gap-2 disabled:opacity-40"
                  >
                    {purging ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden />
                    )}
                    {purging ? "Очищаю…" : "Удалить всё"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
