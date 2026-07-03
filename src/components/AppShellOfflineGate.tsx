"use client";

import { Loader2, RefreshCw, WifiOff } from "lucide-react";
import type { AppConnectivityReason } from "@/lib/app-connectivity";
import { triggerAppHaptic } from "@/lib/app-haptics";

type AppShellOfflineGateProps = {
  reason: AppConnectivityReason;
  checking?: boolean;
  onRetry: () => void;
};

const COPY: Record<
  AppConnectivityReason,
  { title: string; body: string; cta: string }
> = {
  offline: {
    title: "Нет соединения",
    body: "Проверьте интернет — Zovus работает онлайн. Карты вернутся, когда связь восстановится.",
    cta: "Проверить снова",
  },
  maintenance: {
    title: "Короткая пауза",
    body: "Мы обновляем сервис. Обычно это занимает несколько минут — загляните чуть позже.",
    cta: "Обновить",
  },
  server: {
    title: "Сервер не отвечает",
    body: "Сайт временно недоступен. Мы уже разбираемся — попробуйте ещё раз через минуту.",
    cta: "Повторить",
  },
};

export default function AppShellOfflineGate({
  reason,
  checking = false,
  onRetry,
}: AppShellOfflineGateProps) {
  const copy = COPY[reason];

  return (
    <div className="app-shell-offline" role="alertdialog" aria-modal="true">
      <div className="app-shell-offline__glow" aria-hidden />
      <div className="app-shell-offline__card">
        <div className="app-shell-offline__icon-wrap" aria-hidden>
          <WifiOff className="app-shell-offline__icon" strokeWidth={1.5} />
        </div>
        <p className="app-shell-offline__title">{copy.title}</p>
        <p className="app-shell-offline__body">{copy.body}</p>
        <button
          type="button"
          className="app-shell-offline__cta"
          disabled={checking}
          onClick={() => {
            void triggerAppHaptic("light");
            onRetry();
          }}
        >
          {checking ? (
            <>
              <Loader2 className="app-shell-offline__cta-spin" aria-hidden />
              Проверяем…
            </>
          ) : (
            <>
              <RefreshCw className="app-shell-offline__cta-icon" aria-hidden />
              {copy.cta}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
