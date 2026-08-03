"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import AdminShell, { AdminTitle, StatCard, AdminBtn } from "@/components/admin/AdminShell";
import {
  PARTNER_LEAD_STATUS_LABELS,
  type PartnerLeadStatus,
} from "@/lib/partner-leads-shared";

interface Lead {
  id: string;
  contact_name: string;
  phone: string;
  email: string;
  company: string;
  website: string | null;
  message: string;
  status: PartnerLeadStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_FILTERS = [
  { id: "all", label: "Все" },
  { id: "new", label: "Новые" },
  { id: "in_progress", label: "В работе" },
  { id: "done", label: "Закрытые" },
  { id: "spam", label: "Спам" },
] as const;

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function AdminPartnersPageInner() {
  const searchParams = useSearchParams();
  const initialLead = searchParams.get("lead");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState({ newCount: 0, inProgress: 0, total: 0 });
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(initialLead);
  const [active, setActive] = useState<Lead | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    const res = await fetch(`/api/admin/partners/leads?${params}`);
    if (!res.ok) return;
    const data = await res.json();
    setLeads(data.leads ?? []);
    setStats(data.stats ?? { newCount: 0, inProgress: 0, total: 0 });
  }, [statusFilter]);

  const loadLead = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/partners/leads/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setActive(data.lead ?? null);
    setNote(data.lead?.admin_note ?? "");
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadList().finally(() => setLoading(false));
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadLead(selectedId);
    else setActive(null);
  }, [selectedId, loadLead]);

  const patchLead = async (patch: { status?: PartnerLeadStatus; adminNote?: string | null }) => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/partners/leads/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return;
      const data = await res.json();
      setActive(data.lead ?? null);
      setNote(data.lead?.admin_note ?? "");
      void loadList();
    } finally {
      setSaving(false);
    }
  };

  const statusOptions = useMemo(
    () => Object.entries(PARTNER_LEAD_STATUS_LABELS) as [PartnerLeadStatus, string][],
    []
  );

  return (
    <AdminShell>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <AdminTitle title="Партнёры" subtitle="Заявки на сотрудничество с лендинга" />
        <AdminBtn onClick={() => void loadList()} disabled={loading}>
          <RefreshCw className={`mr-1.5 inline h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Обновить
        </AdminBtn>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Новые" value={stats.newCount} />
        <StatCard label="В работе" value={stats.inProgress} />
        <StatCard label="Всего" value={stats.total} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setStatusFilter(f.id)}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
              statusFilter === f.id
                ? "bg-aura-purple/25 text-aura-neon"
                : "bg-white/5 text-gray-400 hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загрузка…
            </div>
          ) : leads.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-gray-500">Заявок пока нет</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {leads.map((lead) => {
                const activeRow = selectedId === lead.id;
                return (
                  <li key={lead.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(lead.id)}
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        activeRow ? "bg-aura-purple/15" : "hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">{lead.company}</p>
                          <p className="truncate text-xs text-gray-400">
                            {lead.contact_name} · {lead.phone}
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-gray-500">
                          {PARTNER_LEAD_STATUS_LABELS[lead.status]}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-gray-600">{formatWhen(lead.created_at)}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5">
          {!active ? (
            <p className="py-12 text-center text-sm text-gray-500">Выберите заявку</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-lg text-white">{active.company}</h2>
                <p className="mt-1 text-sm text-gray-400">{formatWhen(active.created_at)}</p>
              </div>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-gray-500">Имя</dt>
                  <dd className="text-white">{active.contact_name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Телефон</dt>
                  <dd>
                    <a href={`tel:${active.phone}`} className="text-aura-neon hover:underline">
                      {active.phone}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Email</dt>
                  <dd>
                    <a href={`mailto:${active.email}`} className="text-aura-neon hover:underline">
                      {active.email}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Сайт</dt>
                  <dd className="break-all text-gray-300">{active.website || "—"}</dd>
                </div>
              </dl>
              <div>
                <p className="mb-1 text-xs text-gray-500">Сообщение</p>
                <p className="whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-gray-200">
                  {active.message}
                </p>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500">Статус</span>
                <select
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                  value={active.status}
                  disabled={saving}
                  onChange={(e) =>
                    void patchLead({ status: e.target.value as PartnerLeadStatus })
                  }
                >
                  {statusOptions.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-500">Заметка оператора</span>
                <textarea
                  className="min-h-[5rem] w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                />
              </label>
              <AdminBtn
                onClick={() => void patchLead({ adminNote: note })}
                disabled={saving}
              >
                Сохранить заметку
              </AdminBtn>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

export default function AdminPartnersPage() {
  return (
    <Suspense
      fallback={
        <AdminShell>
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загрузка…
          </div>
        </AdminShell>
      }
    >
      <AdminPartnersPageInner />
    </Suspense>
  );
}
