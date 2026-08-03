"use client";

import { useState } from "react";
import { confirmAgeGateOnServer } from "@/lib/age-gate";
import { useAuth } from "@/lib/useAuth";

export default function CabinetAgeGate({ children }: { children: React.ReactNode }) {
  const { user, loading, refresh } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsAgeConfirm =
    !loading && user?.role === "user" && user.ageConfirmed !== true;

  if (!needsAgeConfirm) {
    return <>{children}</>;
  }

  const confirm = async () => {
    setConfirming(true);
    setError(null);
    const ok = await confirmAgeGateOnServer();
    if (!ok) {
      setError("Не удалось подтвердить возраст. Попробуйте ещё раз.");
      setConfirming(false);
      return;
    }
    await refresh();
    setConfirming(false);
  };

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md items-center px-4 py-10">
      <div className="glass-panel w-full space-y-5 p-8 text-center">
        <p className="lux-label">Подтверждение возраста</p>
        <h1 className="font-display text-2xl text-white">Сервис только для взрослых 18+</h1>
        <p className="text-sm leading-relaxed text-aura-ivory/70">
          Кабинет и расклады — развлекательно-ознакомительный сервис. Подтвердите, что вам
          исполнилось 18 лет.
        </p>
        {error ? (
          <p className="text-sm text-red-300/90" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={confirming}
          onClick={() => void confirm()}
          className="btn-luxe btn-luxe--md btn-luxe--gold w-full disabled:opacity-60"
        >
          {confirming ? "Подтверждаем…" : "Мне есть 18 лет — открыть кабинет"}
        </button>
      </div>
    </div>
  );
}
