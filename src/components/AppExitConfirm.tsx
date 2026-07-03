"use client";

import { LogOut } from "lucide-react";
import { triggerAppHaptic } from "@/lib/app-haptics";

type AppExitConfirmProps = {
  onConfirm: () => void;
  onCancel: () => void;
};

export default function AppExitConfirm({ onConfirm, onCancel }: AppExitConfirmProps) {
  return (
    <div className="app-shell-offline" role="alertdialog" aria-modal="true">
      <div className="app-shell-offline__glow" aria-hidden />
      <div className="app-shell-offline__card">
        <div className="app-shell-offline__icon-wrap" aria-hidden>
          <LogOut className="app-shell-offline__icon" strokeWidth={1.5} />
        </div>
        <p className="app-shell-offline__title">Выйти из Zovus?</p>
        <p className="app-shell-offline__body">Приложение закроется. Ваш прогресс сохранён.</p>
        <div className="app-shell-exit-confirm__actions">
          <button
            type="button"
            className="app-shell-offline__cta"
            onClick={() => {
              void triggerAppHaptic("medium");
              onConfirm();
            }}
          >
            Выйти
          </button>
          <button
            type="button"
            className="app-shell-exit-confirm__cancel"
            onClick={() => {
              void triggerAppHaptic("light");
              onCancel();
            }}
          >
            Остаться
          </button>
        </div>
      </div>
    </div>
  );
}
