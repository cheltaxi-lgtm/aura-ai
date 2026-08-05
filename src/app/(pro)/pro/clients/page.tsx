"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProShell from "@/modules/pro/ui/ProShell";

type Client = {
  id: string;
  alias: string;
  consent_state: string;
  birth_date: string | null;
  last_case_at: string | null;
};

export default function ProClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [alias, setAlias] = useState("");
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/pro/clients", { credentials: "include" });
    const json = await res.json();
    if (res.ok) setClients(json.clients || []);
    else setErr(json.message || json.error || "Ошибка");
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setErr(null);
    setNotice(null);
    const res = await fetch("/api/pro/clients", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias, consentConfirmed: consent }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error || "Не удалось создать");
      return;
    }
    setAlias("");
    setConsent(false);
    setNotice("Клиент добавлен");
    await load();
  }

  async function makeIntake() {
    setErr(null);
    setNotice(null);
    const res = await fetch("/api/pro/intake", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const json = await res.json();
    if (res.ok && json.url) {
      const full = `${window.location.origin}${json.url}`;
      try {
        await navigator.clipboard?.writeText(full);
        setNotice(`Ссылка анкеты скопирована: ${json.url}`);
      } catch {
        setNotice(`Ссылка анкеты: ${full}`);
      }
    } else setErr(json.error || "Ошибка анкеты");
  }

  return (
    <ProShell title="Клиенты">
      <div className="pro-panel mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="pro-label">Псевдоним</span>
            <input
              className="pro-field w-56"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Как называть клиента"
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-[var(--pro-muted,#bbb)]">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Согласие ПДн подтверждено
          </label>
          <button
            type="button"
            className="btn-primary px-4 py-2 text-sm"
            onClick={() => void create()}
          >
            Добавить
          </button>
          <button
            type="button"
            className="btn-ghost px-4 py-2 text-sm"
            onClick={() => void makeIntake()}
          >
            Ссылка-анкета
          </button>
        </div>
      </div>
      {err && <p className="mb-3 text-sm text-red-300">{err}</p>}
      {notice && <p className="mb-3 text-sm text-aura-champagne">{notice}</p>}
      {!clients.length && !err ? (
        <p className="text-sm text-[var(--pro-faint,#888)]">
          Пока нет клиентов — добавьте вручную или отправьте ссылку-анкету.
        </p>
      ) : (
        <ul className="space-y-2">
          {clients.map((c) => (
            <li key={c.id}>
              <Link
                href={`/pro/clients/${c.id}`}
                className="pro-panel flex items-center justify-between transition-opacity hover:opacity-90"
              >
                <span className="text-[var(--pro-text,#ede6da)]">{c.alias}</span>
                <span className="text-xs text-[var(--pro-faint,#888)]">
                  {c.consent_state}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ProShell>
  );
}
