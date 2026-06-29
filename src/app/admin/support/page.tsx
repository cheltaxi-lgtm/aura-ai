"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import AdminShell, { AdminTitle, StatCard, AdminBtn } from "@/components/admin/AdminShell";
import SupportChat, { SupportStatusBadge } from "@/components/support/SupportChat";
import type { SupportMessage } from "@/components/support/SupportChat";

interface Ticket {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  unread_by_admin: boolean;
  last_message_at: string;
  last_message_preview?: string | null;
  user_email?: string;
  user_name?: string;
  assigned_admin_name?: string | null;
  messages_count?: string;
}

interface Labels {
  categories: Record<string, string>;
  statuses: Record<string, string>;
  priorities: Record<string, string>;
}

const STATUS_FILTERS = [
  { id: "all", label: "Все" },
  { id: "open", label: "Открытые" },
  { id: "in_progress", label: "В работе" },
  { id: "waiting_user", label: "Ожидают ответа" },
  { id: "resolved", label: "Решённые" },
  { id: "closed", label: "Закрытые" },
] as const;

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [labels, setLabels] = useState<Labels>({
    categories: {},
    statuses: {},
    priorities: {},
  });
  const [stats, setStats] = useState({ open: 0, unread: 0, total: 0 });
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [updating, setUpdating] = useState(false);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (unreadOnly) params.set("unread", "1");
    const res = await fetch(`/api/admin/support/tickets?${params}`);
    if (!res.ok) return;
    const data = await res.json();
    setTickets(data.tickets ?? []);
    setStats(data.stats ?? { open: 0, unread: 0, total: 0 });
    if (data.labels) setLabels(data.labels);
  }, [statusFilter, unreadOnly]);

  const loadTicket = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/support/tickets/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setActiveTicket(data.ticket);
    setMessages(data.messages ?? []);
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadList().finally(() => setLoading(false));
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadTicket(selectedId);
  }, [selectedId, loadTicket]);

  const handleSend = async (content: string) => {
    if (!selectedId) return;
    const res = await fetch(`/api/admin/support/tickets/${selectedId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.error === "ticket_closed") throw new Error("Обращение закрыто");
      throw new Error("Не удалось отправить");
    }
    setMessages((prev) => [...prev, data.message]);
    void loadList();
  };

  const pollMessages = useCallback(async () => {
    if (!selectedId) return messages;
    const res = await fetch(`/api/admin/support/tickets/${selectedId}`);
    if (!res.ok) return messages;
    const data = await res.json();
    setMessages(data.messages ?? []);
    setActiveTicket(data.ticket);
    return data.messages ?? [];
  }, [selectedId, messages]);

  const updateTicket = async (patch: Record<string, unknown>) => {
    if (!selectedId) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/support/tickets/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveTicket((prev) => (prev ? { ...prev, ...data.ticket } : data.ticket));
        void loadList();
      }
    } finally {
      setUpdating(false);
    }
  };

  const isClosed = activeTicket?.status === "closed";

  return (
    <AdminShell>
      <AdminTitle
        title="Техподдержка"
        subtitle="Обращения пользователей и переписка с клиентами"
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Открытых" value={stats.open} accent="text-amber-300" />
        <StatCard label="Непрочитанных" value={stats.unread} accent="text-aura-neon" />
        <StatCard label="Всего обращений" value={stats.total} />
      </div>

      <div className="flex h-[calc(100vh-280px)] min-h-[480px] gap-4">
        {/* Ticket list */}
        <div className="flex w-full flex-col rounded-2xl border border-white/10 bg-black/20 md:w-96 md:shrink-0">
          <div className="border-b border-white/10 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400">Обращения</span>
              <button
                type="button"
                onClick={() => void loadList()}
                className="rounded p-1 text-gray-500 hover:text-white"
                aria-label="Обновить"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={`rounded-lg px-2 py-1 text-[10px] ${
                    statusFilter === f.id
                      ? "bg-aura-purple/20 text-aura-neon"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-gray-500">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
                className="rounded"
              />
              Только непрочитанные
            </label>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
              </div>
            ) : tickets.length === 0 ? (
              <p className="py-12 text-center text-xs text-gray-600">Нет обращений</p>
            ) : (
              tickets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full border-b border-white/5 px-3 py-3 text-left transition-colors hover:bg-white/[0.03] ${
                    selectedId === t.id ? "bg-aura-purple/10" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-1 text-sm font-medium text-white">{t.subject}</p>
                    {t.unread_by_admin ? (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-aura-neon" />
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[10px] text-gray-500">
                    {t.user_name ?? t.user_email ?? "—"}
                  </p>
                  {t.last_message_preview ? (
                    <p className="mt-1 line-clamp-2 text-[11px] text-gray-600">
                      {t.last_message_preview}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1">
                    <SupportStatusBadge status={t.status} labels={labels.statuses} />
                    {t.priority === "high" ? (
                      <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] text-red-300">
                        Высокий
                      </span>
                    ) : null}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div className="hidden min-w-0 flex-1 flex-col md:flex">
          {!selectedId || !activeTicket ? (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-sm text-gray-600">
              Выберите обращение слева
            </div>
          ) : (
            <>
              <div className="mb-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-medium text-white">{activeTicket.subject}</h2>
                    <p className="mt-1 text-xs text-gray-500">
                      {activeTicket.user_name} · {activeTicket.user_email}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <SupportStatusBadge status={activeTicket.status} labels={labels.statuses} />
                      <span className="text-xs text-gray-500">
                        {labels.categories[activeTicket.category]}
                      </span>
                      {activeTicket.assigned_admin_name ? (
                        <span className="text-xs text-gray-600">
                          · {activeTicket.assigned_admin_name}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeTicket.status !== "in_progress" && activeTicket.status !== "closed" ? (
                      <AdminBtn
                        onClick={() => void updateTicket({ status: "in_progress" })}
                        disabled={updating}
                      >
                        В работу
                      </AdminBtn>
                    ) : null}
                    {activeTicket.status !== "resolved" && activeTicket.status !== "closed" ? (
                      <AdminBtn
                        onClick={() => void updateTicket({ status: "resolved" })}
                        disabled={updating}
                      >
                        Решено
                      </AdminBtn>
                    ) : null}
                    {activeTicket.status !== "closed" ? (
                      <AdminBtn
                        variant="danger"
                        onClick={() => void updateTicket({ status: "closed" })}
                        disabled={updating}
                      >
                        Закрыть
                      </AdminBtn>
                    ) : null}
                    {activeTicket.priority !== "high" ? (
                      <AdminBtn
                        onClick={() => void updateTicket({ priority: "high" })}
                        disabled={updating}
                      >
                        ↑ Приоритет
                      </AdminBtn>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1">
                <SupportChat
                  messages={messages}
                  onSend={handleSend}
                  disabled={isClosed}
                  disabledHint={isClosed ? "Обращение закрыто" : undefined}
                  viewerRole="admin"
                  onPoll={pollMessages}
                  pollingMs={5000}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile chat overlay */}
      {selectedId && activeTicket ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a10] p-4 md:hidden">
          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                setActiveTicket(null);
              }}
              className="text-sm text-gray-500"
            >
              ← Назад
            </button>
            <span className="truncate text-sm font-medium text-white">{activeTicket.subject}</span>
          </div>
          <div className="min-h-0 flex-1">
            <SupportChat
              messages={messages}
              onSend={handleSend}
              disabled={isClosed}
              viewerRole="admin"
              onPoll={pollMessages}
            />
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
