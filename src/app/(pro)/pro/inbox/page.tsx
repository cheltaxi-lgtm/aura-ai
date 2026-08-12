"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProShell from "@/modules/pro/ui/ProShell";

type InboxRow = {
  threadId: string;
  caseId: string;
  clientId: string;
  pendingCount: number;
  status: string;
};

const AUTHOR_RU: Record<string, string> = {
  client: "Клиент",
  ai_draft: "Черновик ИИ",
  ai_direct: "ИИ",
  practitioner: "Вы",
  system: "Система",
};

const MODERATION_RU: Record<string, string> = {
  pending: "на утверждении",
  approved: "отправлено",
  rejected: "отклонено",
  auto: "",
};

export default function ProInboxPage() {
  const [inbox, setInbox] = useState<InboxRow[]>([]);
  const [messages, setMessages] = useState<
    {
      id: string;
      author: string;
      body: string;
      moderation_state: string;
      feedback?: string | null;
    }[]
  >([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState<Record<string, string>>({});
  const [rejectOpen, setRejectOpen] = useState<string | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadInbox() {
    const res = await fetch("/api/pro/inbox", { credentials: "include" });
    const json = await res.json();
    if (res.ok) setInbox(json.inbox || []);
  }

  async function openThread(id: string) {
    setThreadId(id);
    setActionError(null);
    const res = await fetch(`/api/pro/inbox?threadId=${id}`, {
      credentials: "include",
    });
    const json = await res.json();
    if (res.ok) setMessages(json.messages || []);
  }

  useEffect(() => {
    void loadInbox();
  }, []);

  async function approve(messageId: string) {
    setActionError(null);
    const res = await fetch("/api/pro/inbox", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId,
        body: editBody[messageId],
      }),
    });
    if (!res.ok) {
      setActionError("Не удалось отправить — возможно, черновик уже обработан");
      return;
    }
    if (threadId) await openThread(threadId);
    await loadInbox();
  }

  async function reject(messageId: string) {
    setActionError(null);
    const res = await fetch("/api/pro/inbox", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId,
        action: "reject",
        feedback: rejectFeedback,
      }),
    });
    if (!res.ok) {
      setActionError("Не удалось отклонить — возможно, черновик уже обработан");
      return;
    }
    setRejectOpen(null);
    setRejectFeedback("");
    if (threadId) await openThread(threadId);
    await loadInbox();
  }

  return (
    <ProShell title="Входящие">
      <div className="grid gap-6 md:grid-cols-2">
        <ul className="space-y-2">
          {inbox.map((t) => (
            <li key={t.threadId}>
              <button
                type="button"
                className={`pro-panel w-full text-left text-sm transition-opacity hover:opacity-90 ${
                  threadId === t.threadId ? "ring-1 ring-aura-gold/40" : ""
                }`}
                onClick={() => void openThread(t.threadId)}
              >
                <span className="text-[var(--pro-text,#ede6da)]">
                  Кейс #{t.caseId}
                </span>
                <span className="mt-1 block text-xs text-[var(--pro-faint,#888)]">
                  {t.pendingCount > 0
                    ? `${t.pendingCount} на утверждении`
                    : "открыт"}
                  {" · "}
                  <Link
                    href={`/pro/case/${t.caseId}`}
                    className="text-aura-champagne underline-offset-2 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    открыть кейс
                  </Link>
                </span>
              </button>
            </li>
          ))}
          {!inbox.length && (
            <p className="text-sm text-[var(--pro-faint,#888)]">
              Нет открытых диалогов — вопросы клиентов появятся после выдачи
              отчёта.
            </p>
          )}
        </ul>
        <div className="space-y-3">
          {!threadId && inbox.length > 0 && (
            <p className="text-sm text-[var(--pro-faint,#888)]">
              Выберите тред слева
            </p>
          )}
          {actionError ? (
            <p className="text-sm text-red-300" role="alert">
              {actionError}
            </p>
          ) : null}
          {messages.map((m) => (
            <div key={m.id} className="pro-panel text-sm">
              <p className="text-xs text-[var(--pro-faint,#888)]">
                {AUTHOR_RU[m.author] ?? m.author}
                {MODERATION_RU[m.moderation_state]
                  ? ` · ${MODERATION_RU[m.moderation_state]}`
                  : ""}
              </p>
              {m.author === "ai_draft" && m.moderation_state === "pending" ? (
                <>
                  <textarea
                    className="pro-field mt-2 min-h-[100px]"
                    value={editBody[m.id] ?? m.body}
                    onChange={(e) =>
                      setEditBody((prev) => ({ ...prev, [m.id]: e.target.value }))
                    }
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary px-3 py-1.5 text-xs"
                      onClick={() => void approve(m.id)}
                    >
                      Утвердить и отправить
                    </button>
                    <button
                      type="button"
                      className="rounded border border-red-400/30 px-3 py-1.5 text-xs text-red-200/90"
                      onClick={() => {
                        setRejectOpen(rejectOpen === m.id ? null : m.id);
                        setRejectFeedback("");
                      }}
                    >
                      Отклонить
                    </button>
                  </div>
                  {rejectOpen === m.id ? (
                    <div className="mt-2">
                      <textarea
                        className="pro-field min-h-[60px] text-xs"
                        placeholder="Что не так? (необязательно — поможет следующим черновикам)"
                        value={rejectFeedback}
                        onChange={(e) => setRejectFeedback(e.target.value)}
                        maxLength={2000}
                      />
                      <button
                        type="button"
                        className="mt-2 rounded border border-red-400/40 px-3 py-1.5 text-xs text-red-200"
                        onClick={() => void reject(m.id)}
                      >
                        Подтвердить отклонение
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="mt-1 whitespace-pre-wrap text-[var(--pro-text,#ede6da)]">
                    {m.body}
                  </p>
                  {m.moderation_state === "rejected" && m.feedback ? (
                    <p className="mt-1 text-xs text-[var(--pro-faint,#888)]">
                      Причина: {m.feedback}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </ProShell>
  );
}
