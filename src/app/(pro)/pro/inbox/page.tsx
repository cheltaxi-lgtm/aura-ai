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

export default function ProInboxPage() {
  const [inbox, setInbox] = useState<InboxRow[]>([]);
  const [messages, setMessages] = useState<
    {
      id: string;
      author: string;
      body: string;
      moderation_state: string;
    }[]
  >([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState<Record<string, string>>({});

  async function loadInbox() {
    const res = await fetch("/api/pro/inbox", { credentials: "include" });
    const json = await res.json();
    if (res.ok) setInbox(json.inbox || []);
  }

  async function openThread(id: string) {
    setThreadId(id);
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
    await fetch("/api/pro/inbox", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId,
        body: editBody[messageId],
      }),
    });
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
          {messages.map((m) => (
            <div key={m.id} className="pro-panel text-sm">
              <p className="text-xs text-[var(--pro-faint,#888)]">
                {m.author === "client"
                  ? "Клиент"
                  : m.author === "ai_draft"
                    ? "Черновик ИИ"
                    : m.author}{" "}
                · {m.moderation_state}
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
                  <button
                    type="button"
                    className="btn-primary mt-2 px-3 py-1.5 text-xs"
                    onClick={() => void approve(m.id)}
                  >
                    Утвердить и отправить
                  </button>
                </>
              ) : (
                <p className="mt-1 whitespace-pre-wrap text-[var(--pro-text,#ede6da)]">
                  {m.body}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </ProShell>
  );
}
