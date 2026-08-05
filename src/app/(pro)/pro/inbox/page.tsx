"use client";

import { useEffect, useState } from "react";
import ProShell from "@/modules/pro/ui/ProShell";

export default function ProInboxPage() {
  const [inbox, setInbox] = useState<
    { threadId: string; caseId: string; pendingCount: number; status: string }[]
  >([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);

  async function loadInbox() {
    const res = await fetch("/api/pro/inbox", { credentials: "include" });
    const json = await res.json();
    if (res.ok) setInbox(json.inbox || []);
  }

  async function openThread(id: string) {
    setThreadId(id);
    const res = await fetch(`/api/pro/inbox?threadId=${id}`, { credentials: "include" });
    const json = await res.json();
    if (res.ok) setMessages(json.messages || []);
  }

  useEffect(() => {
    void loadInbox();
  }, []);

  async function approve(messageId: string, body?: string) {
    await fetch("/api/pro/inbox", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, body }),
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
                className="w-full rounded border border-[#c9a24a]/20 px-3 py-2 text-left text-sm text-[#ede6da]"
                onClick={() => void openThread(t.threadId)}
              >
                Тред {t.threadId} · pending {t.pendingCount}
              </button>
            </li>
          ))}
          {!inbox.length && (
            <p className="text-sm text-gray-500">Нет открытых диалогов</p>
          )}
        </ul>
        <div className="space-y-3">
          {messages.map((m) => (
            <div key={m.id} className="rounded border border-[#c9a24a]/15 p-3 text-sm">
              <p className="text-xs text-gray-500">
                {m.author} · {m.moderation_state}
              </p>
              <p className="mt-1 text-gray-200 whitespace-pre-wrap">{m.body}</p>
              {m.author === "ai_draft" && m.moderation_state === "pending" && (
                <button
                  type="button"
                  className="btn-neon mt-2 px-3 py-1 text-xs"
                  onClick={() => void approve(m.id)}
                >
                  Утвердить
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </ProShell>
  );
}
