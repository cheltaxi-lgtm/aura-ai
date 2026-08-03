"use client";

import { useCallback, useEffect, useState } from "react";
import { REPORT_SHARE_SECTION_ALLOWLIST, type ShareReportKind } from "@/lib/natal/report-share";

type Share = {
  id: string; token: string; reportKind: ShareReportKind; reportId: string;
  selectedSections: string[]; expiresAt: string; revokedAt: string | null;
};

export default function ReportShareControls({
  reportKind,
  reportId,
  requireThirdPartyConsent = false,
}: {
  reportKind: ShareReportKind;
  reportId: string;
  requireThirdPartyConsent?: boolean;
}) {
  const allowed = REPORT_SHARE_SECTION_ALLOWLIST[reportKind];
  const [selected, setSelected] = useState<string[]>([]);
  const [days, setDays] = useState(7);
  const [shares, setShares] = useState<Share[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [thirdPartyConsent, setThirdPartyConsent] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/report-shares", { credentials: "include" });
      const data = await response.json().catch(() => ({})) as { shares?: Share[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить приватные ссылки.");
      setShares((data.shares ?? []).filter((share) => share.reportKind === reportKind && share.reportId === reportId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить приватные ссылки.");
    } finally {
      setLoading(false);
    }
  }, [reportId, reportKind]);
  useEffect(() => { void load(); }, [load]);
  const create = async () => {
    if (!selected.length) { setError("Выберите хотя бы один раздел."); return; }
    if (requireThirdPartyConsent && !thirdPartyConsent) {
      setError("Подтвердите согласие второго участника на публикацию.");
      return;
    }
    setBusy(true); setNotice(""); setError("");
    try {
      const response = await fetch("/api/report-shares", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportKind,
          reportId,
          sections: selected,
          expiresInDays: days,
          thirdPartyConsentAcknowledged: requireThirdPartyConsent ? thirdPartyConsent : undefined,
        }),
      });
      const data = await response.json().catch(() => ({})) as { share?: { url: string }; error?: string };
      if (!response.ok || !data.share) throw new Error(data.error || "Не удалось создать ссылку.");
      const shareUrl = new URL(data.share.url, window.location.origin);
      if (shareUrl.origin !== window.location.origin) throw new Error("Сервер вернул некорректную приватную ссылку.");
      const url = `${shareUrl.origin}${shareUrl.pathname}`;
      try {
        await navigator.clipboard.writeText(url);
        setNotice("Приватная ссылка создана и скопирована.");
      } catch {
        setNotice("Приватная ссылка создана. Скопируйте её кнопкой ниже.");
      }
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось создать ссылку.");
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (id: string) => {
    setBusy(true); setNotice(""); setError("");
    try {
      const response = await fetch(`/api/report-shares/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error("Не удалось отозвать ссылку.");
      setNotice("Приватная ссылка отозвана.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось отозвать ссылку.");
    } finally {
      setBusy(false);
    }
  };
  const copy = async (token: string) => {
    setNotice(""); setError("");
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/reports/shared/${encodeURIComponent(token)}`);
      setNotice("Приватная ссылка скопирована.");
    } catch {
      setError("Браузер не разрешил копирование. Откройте ссылку и скопируйте адрес вручную.");
    }
  };
  return <details className="mt-4 rounded-lg border border-white/10 p-3 text-xs">
    <summary className="cursor-pointer text-amber-100/70">Приватная ссылка (по умолчанию выключена)</summary>
    <fieldset className="mt-3"><legend className="text-white/45">Опубликовать только выбранные разделы</legend>
      <div className="mt-2 flex flex-wrap gap-2">{allowed.map((section) => <label key={section}
        className="flex min-h-9 items-center gap-2 rounded-lg bg-white/[0.04] px-2 text-white/60">
        <input type="checkbox" checked={selected.includes(section)} onChange={() =>
          setSelected((current) => current.includes(section) ? current.filter((item) => item !== section) : [...current, section])} />
        {section}
      </label>)}</div>
    </fieldset>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <label className="text-white/45">Срок <select value={days} onChange={(event) => setDays(Number(event.target.value))}
        className="ml-1 min-h-9 rounded bg-[#17131d] px-2 text-white"><option value={1}>1 день</option><option value={7}>7 дней</option><option value={30}>30 дней</option><option value={90}>90 дней</option></select></label>
      <button type="button" disabled={busy || (requireThirdPartyConsent && !thirdPartyConsent)} onClick={() => void create()} className="min-h-9 rounded-lg bg-amber-300/15 px-3 text-amber-100 disabled:opacity-50">Создать ссылку</button>
    </div>
    {requireThirdPartyConsent ? <label className="mt-3 flex items-start gap-2 text-white/50">
      <input type="checkbox" className="mt-0.5" checked={thirdPartyConsent}
        onChange={(event) => setThirdPartyConsent(event.target.checked)} />
      Подтверждаю согласие второго участника на публикацию выбранных разделов.
    </label> : null}
    {loading ? <p className="mt-3 text-white/40" role="status">Загружаем активные ссылки…</p> : null}
    {notice ? <p className="mt-2 text-emerald-200/70" role="status">{notice}</p> : null}
    {error ? <div className="mt-2 text-rose-300" role="alert"><p>{error}</p><button type="button" onClick={() => void load()} className="mt-1 min-h-9 text-amber-200">Повторить</button></div> : null}
    {shares.filter((share) => !share.revokedAt).map((share) => <div key={share.id} className="mt-2 flex items-center justify-between gap-2 rounded bg-black/20 p-2">
      <span className="text-white/40">до {new Date(share.expiresAt).toLocaleString("ru-RU")}</span>
      <span className="flex gap-3"><button type="button" disabled={busy} onClick={() => void copy(share.token)} className="min-h-9 text-amber-200 disabled:opacity-50">Копировать</button>
        <button type="button" disabled={busy} onClick={() => void revoke(share.id)} className="min-h-9 text-rose-300 disabled:opacity-50">Отозвать</button></span>
    </div>)}
    {!loading && !shares.some((share) => !share.revokedAt) ? <p className="mt-3 text-white/40">Активных приватных ссылок пока нет.</p> : null}
  </details>;
}
