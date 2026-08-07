"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import AdminShell, { AdminBtn, AdminTitle } from "@/components/admin/AdminShell";

type QaItem = {
  id: string;
  chartId: string;
  userId: string;
  status: string;
  error: string | null;
  qualityFindings: unknown;
  reportTextPreview: string | null;
  createdAt: string;
  transactionId: string | null;
};

type Detail = {
  id: string;
  status: string;
  reportText: string | null;
  qualityFindings: unknown;
  error: string | null;
  chartId: string;
};

export default function AdminHdReportsPage() {
  const [items, setItems] = useState<QaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [sections, setSections] = useState<string[]>([]);
  const [sectionTitle, setSectionTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/hd-reports?limit=80");
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.items ?? []);
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  async function openItem(id: string) {
    setMsg(null);
    const res = await fetch(`/api/admin/hd-reports?id=${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const data = await res.json();
    setSelected(data.report as Detail);
    setSections(Array.isArray(data.sections) ? data.sections : []);
    if (!sectionTitle && Array.isArray(data.sections) && data.sections[0]) {
      setSectionTitle(data.sections[0]);
    }
  }

  async function act(
    action: "approve" | "regenerate" | "validate" | "regenerate_section"
  ) {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/hd-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reportId: selected.id,
          sectionTitle: action === "regenerate_section" ? sectionTitle : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error || `Ошибка ${res.status}`);
        return;
      }
      if (action === "validate") {
        setMsg(JSON.stringify(data.quality, null, 2));
        return;
      }
      setMsg(
        JSON.stringify(
          {
            ok: data.ok,
            costRub: data.costRub,
            llmCalls: data.llmCalls,
            needsRegeneration: data.needsRegeneration,
            findings: data.findings,
          },
          null,
          2
        )
      );
      await load();
      await openItem(selected.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell>
      <AdminTitle
        title="HD отчёты — качество"
        subtitle="Валидатор, needs_regeneration, реген секции / полный, одобрение"
      />
      <div className="mb-4 flex gap-2">
        <AdminBtn onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {" "}
          Обновить
        </AdminBtn>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-panel max-h-[70vh] space-y-2 overflow-y-auto p-4">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => void openItem(it.id)}
              className={`block w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                selected?.id === it.id
                  ? "border-aura-gold/40 bg-aura-gold/10"
                  : "border-white/10 hover:bg-white/5"
              }`}
            >
              <div className="flex justify-between gap-2">
                <span className="font-medium text-white">{it.status}</span>
                <span className="text-xs text-gray-500">
                  {new Date(it.createdAt).toLocaleString("ru-RU")}
                </span>
              </div>
              <div className="mt-1 truncate text-xs text-gray-400">{it.id}</div>
              {Array.isArray(it.qualityFindings) && it.qualityFindings.length > 0 ? (
                <div className="mt-1 text-xs text-amber-300">
                  правил: {it.qualityFindings.length}
                </div>
              ) : null}
            </button>
          ))}
          {!loading && items.length === 0 ? (
            <p className="text-sm text-gray-500">Пока нет отчётов</p>
          ) : null}
        </div>

        <div className="glass-panel p-4">
          {!selected ? (
            <p className="text-sm text-gray-500">Выберите отчёт слева</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                <AdminBtn disabled={busy} onClick={() => void act("validate")}>
                  Проверить валидатором
                </AdminBtn>
                <AdminBtn disabled={busy} onClick={() => void act("regenerate")}>
                  Перегенерировать всё
                </AdminBtn>
                <AdminBtn
                  disabled={busy || selected.status !== "needs_regeneration"}
                  onClick={() => void act("approve")}
                >
                  Одобрить вручную
                </AdminBtn>
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <select
                  className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-gray-200"
                  value={sectionTitle}
                  onChange={(e) => setSectionTitle(e.target.value)}
                >
                  {sections.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <AdminBtn
                  disabled={busy || !sectionTitle}
                  onClick={() => void act("regenerate_section")}
                >
                  Перегенерировать секцию
                </AdminBtn>
              </div>
              <p className="text-xs text-gray-500">status: {selected.status}</p>
              {selected.qualityFindings ? (
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/30 p-2 text-xs text-amber-200">
                  {JSON.stringify(selected.qualityFindings, null, 2)}
                </pre>
              ) : null}
              {msg ? (
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/30 p-2 text-xs text-gray-300">
                  {msg}
                </pre>
              ) : null}
              <div className="mt-4 max-h-[50vh] overflow-auto whitespace-pre-wrap text-sm text-gray-200">
                {selected.reportText || "— нет текста —"}
              </div>
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
