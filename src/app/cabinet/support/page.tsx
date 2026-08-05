"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Plus, MessageCircle } from "lucide-react";
import SupportChat, { SupportStatusBadge } from "@/components/support/SupportChat";
import type { SupportMessage } from "@/components/support/SupportChat";
import { attachRecaptchaToken } from "@/lib/client-recaptcha";
import { fetchPlatformFeatures } from "@/lib/usePlatformFeatures";

interface Ticket {
  id: string;
  subject: string;
  category: string;
  status: string;
  unread_by_user: boolean;
  last_message_at: string;
  last_message_preview?: string | null;
  messages_count?: string;
}

interface Labels {
  categories: Record<string, string>;
  statuses: Record<string, string>;
}

const CATEGORIES = [
  { id: "general", label: "Общий вопрос" },
  { id: "payment", label: "Оплата и руны" },
  { id: "technical", label: "Техническая проблема" },
  { id: "account", label: "Аккаунт" },
  { id: "other", label: "Другое" },
] as const;

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [labels, setLabels] = useState<Labels>({ categories: {}, statuses: {} });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newCategory, setNewCategory] = useState<string>("general");
  const [newMessage, setNewMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    const res = await fetch("/api/support/tickets", { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    setTickets(data.tickets ?? []);
    if (data.labels) setLabels(data.labels);
  }, []);

  const loadTicket = useCallback(async (id: string) => {
    const res = await fetch(`/api/support/tickets/${id}`, { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    setActiveTicket(data.ticket);
    setMessages(data.messages ?? []);
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    void loadTickets().finally(() => setLoading(false));
  }, [loadTickets]);

  useEffect(() => {
    if (selectedId) void loadTicket(selectedId);
  }, [selectedId, loadTicket]);

  const handleCreate = async () => {
    if (!newSubject.trim() || !newMessage.trim()) {
      setCreateError("Заполните тему и сообщение");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const features = await fetchPlatformFeatures();
      const payload: Record<string, unknown> = {
        subject: newSubject,
        category: newCategory,
        message: newMessage,
      };
      const captchaErr = await attachRecaptchaToken(payload, "support", features);
      if (captchaErr) {
        setCreateError(captchaErr);
        return;
      }

      const res = await fetch("/api/support/tickets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(
          data.error === "subject_required" || data.error === "message_required"
            ? "Заполните тему и сообщение"
            : "Не удалось создать обращение"
        );
        return;
      }
      setShowNewForm(false);
      setNewSubject("");
      setNewMessage("");
      setNewCategory("general");
      await loadTickets();
      setSelectedId(data.ticket.id);
    } finally {
      setCreating(false);
    }
  };

  const handleSend = async (content: string) => {
    if (!selectedId) return;
    const features = await fetchPlatformFeatures();
    const payload: Record<string, unknown> = { content };
    const captchaErr = await attachRecaptchaToken(payload, "support", features);
    if (captchaErr) throw new Error(captchaErr);

    const res = await fetch(`/api/support/tickets/${selectedId}/messages`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.error === "ticket_closed") throw new Error("Обращение закрыто");
      throw new Error("Не удалось отправить");
    }
    setMessages((prev) => [...prev, data.message]);
    void loadTickets();
  };

  const pollMessages = useCallback(async () => {
    if (!selectedId) return messages;
    const res = await fetch(`/api/support/tickets/${selectedId}`, { credentials: "include" });
    if (!res.ok) return messages;
    const data = await res.json();
    setMessages(data.messages ?? []);
    setActiveTicket(data.ticket);
    return data.messages ?? [];
  }, [selectedId, messages]);

  const handleClose = async () => {
    if (!selectedId || !confirm("Закрыть обращение?")) return;
    await fetch(`/api/support/tickets/${selectedId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close" }),
    });
    await loadTicket(selectedId);
    void loadTickets();
  };

  const isClosed =
    activeTicket?.status === "closed" || activeTicket?.status === "resolved";

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_rgba(88,28,135,0.18)_0%,_transparent_55%),#000] pb-8 pt-6 text-white">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/cabinet"
            className="rounded-xl border border-white/10 p-2 text-gray-400 hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="font-display text-xl font-bold text-white md:text-2xl">
              Техподдержка
            </h1>
            <p className="text-xs text-gray-500">Мы ответим в рабочее время</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-aura-champagne" />
          </div>
        ) : selectedId && activeTicket ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(null);
                    setActiveTicket(null);
                    setMessages([]);
                  }}
                  className="mb-2 text-xs text-gray-500 hover:text-white"
                >
                  ← Все обращения
                </button>
                <h2 className="font-medium text-white">{activeTicket.subject}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <SupportStatusBadge status={activeTicket.status} labels={labels.statuses} />
                  <span className="text-xs text-gray-500">
                    {labels.categories[activeTicket.category] ?? activeTicket.category}
                  </span>
                </div>
              </div>
              {!isClosed ? (
                <button
                  type="button"
                  onClick={() => void handleClose()}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:text-white"
                >
                  Закрыть обращение
                </button>
              ) : null}
            </div>

            <div className="h-[min(60vh,520px)]">
              <SupportChat
                messages={messages}
                onSend={handleSend}
                disabled={isClosed}
                disabledHint={
                  isClosed ? "Обращение закрыто. Создайте новое, если вопрос остался." : undefined
                }
                viewerRole="user"
                onPoll={pollMessages}
              />
            </div>
          </div>
        ) : showNewForm ? (
          <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="font-medium text-white">Новое обращение</h2>
            {createError ? (
              <p className="text-sm text-red-400">{createError}</p>
            ) : null}
            <div>
              <label className="mb-1 block text-xs text-gray-500">Тема</label>
              <input
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                maxLength={200}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                placeholder="Кратко опишите проблему"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Категория</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Сообщение</label>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                rows={5}
                maxLength={4000}
                className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                placeholder="Опишите ситуацию подробнее…"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating}
                className="cabinet-btn cabinet-btn--primary flex-1"
              >
                {creating ? "Отправка…" : "Отправить"}
              </button>
              <button
                type="button"
                onClick={() => setShowNewForm(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-400"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setShowNewForm(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-aura-gold/40 bg-aura-gold/5 py-4 text-sm text-aura-champagne hover:bg-aura-gold/10"
            >
              <Plus className="h-4 w-4" />
              Новое обращение
            </button>

            {tickets.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-600">
                <MessageCircle className="mx-auto mb-3 h-10 w-10 opacity-40" />
                Обращений пока нет
              </div>
            ) : (
              <ul className="space-y-2">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className="flex w-full items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition-colors hover:border-white/20 hover:bg-white/[0.05]"
                    >
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5">
                        <MessageCircle className="h-4 w-4 text-gray-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium text-white">{t.subject}</p>
                          {t.unread_by_user ? (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                          ) : null}
                        </div>
                        {t.last_message_preview ? (
                          <p className="mt-1 line-clamp-1 text-xs text-gray-500">
                            {t.last_message_preview}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <SupportStatusBadge status={t.status} labels={labels.statuses} />
                          <span className="text-[10px] text-gray-600">
                            {new Date(t.last_message_at).toLocaleDateString("ru-RU")}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
