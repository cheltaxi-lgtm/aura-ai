"use client";

import { useEffect, useState } from "react";

type DirectDiag = {
  api?: string;
  auth?: string;
  configured?: boolean;
  error?: string | null;
};

export default function DirectStatusCard({ className = "" }: { className?: string }) {
  const [direct, setDirect] = useState<DirectDiag | null>(null);
  const [loginSet, setLoginSet] = useState<boolean | null>(null);
  const [tokenSet, setTokenSet] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/ads/admin/diagnostics")
      .then(async (r) => {
        if (!r.ok) return;
        const d = (await r.json()) as {
          env?: { ADS_DIRECT_TOKEN?: boolean; ADS_DIRECT_LOGIN?: boolean };
          providers?: { provider: string; api?: string; auth?: string; configured?: boolean; error?: string | null }[];
        };
        setTokenSet(d.env?.ADS_DIRECT_TOKEN ?? null);
        setLoginSet(d.env?.ADS_DIRECT_LOGIN ?? null);
        const row = d.providers?.find((p) => p.provider === "direct");
        if (row) setDirect({ api: row.api, auth: row.auth, configured: row.configured, error: row.error });
      })
      .catch(() => {
        /* banner is optional */
      });
  }, []);

  const blocked = Boolean(direct?.error && /BLOCKED_EXTERNAL|логин не подключен/i.test(direct.error));
  const status = !direct
    ? "…"
    : blocked
      ? "BLOCKED_EXTERNAL"
      : direct.api === "ok"
        ? "PASS"
        : !direct.configured
          ? "NOT_CONFIGURED"
          : "FAIL";

  return (
    <div className={`glass-panel mb-4 space-y-2 p-4 text-sm ${className}`}>
      <h2 className="text-sm font-semibold text-white">Яндекс.Директ</h2>
      <p>
        Кабинет:{" "}
        <span className={blocked || status === "FAIL" ? "text-red-400" : "text-aura-gold"}>{status}</span>
      </p>
      {direct?.error ? <p className="text-xs text-red-300/90">{direct.error}</p> : null}
      <ul className="space-y-1 text-xs text-gray-400">
        <li>ADS_DIRECT_TOKEN: {tokenSet == null ? "…" : tokenSet ? "задан" : "нет"}</li>
        <li>ADS_DIRECT_LOGIN: {loginSet == null ? "…" : loginSet ? "задан (значение скрыто)" : "нет"}</li>
        <li>
          Pause/Resume и негативы идут только через canMutateDirect (ads.enabled + autopilot.write +
          ADS_RULES_MODE=apply).
        </li>
      </ul>
    </div>
  );
}
