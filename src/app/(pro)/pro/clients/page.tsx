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
    await load();
  }

  async function makeIntake() {
    const res = await fetch("/api/pro/intake", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const json = await res.json();
    if (res.ok && json.url) {
      await navigator.clipboard?.writeText(`${window.location.origin}${json.url}`);
      alert(`Ссылка анкеты скопирована:\n${json.url}`);
    } else setErr(json.error || "Ошибка анкеты");
  }

  return (
    <ProShell title="Клиенты">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block text-sm text-gray-300">
          Псевдоним
          <input
            className="mt-1 block w-56 rounded border border-[#c9a24a]/30 bg-black/30 px-3 py-2"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          Согласие ПДн подтверждено
        </label>
        <button type="button" className="btn-neon px-4 py-2 text-sm" onClick={() => void create()}>
          Добавить
        </button>
        <button
          type="button"
          className="rounded border border-[#c9a24a]/40 px-4 py-2 text-sm text-[#e8c77e]"
          onClick={() => void makeIntake()}
        >
          Ссылка-анкета
        </button>
      </div>
      {err && <p className="mb-3 text-sm text-red-300">{err}</p>}
      <ul className="space-y-2">
        {clients.map((c) => (
          <li key={c.id}>
            <Link
              href={`/pro/clients/${c.id}`}
              className="flex items-center justify-between rounded border border-[#c9a24a]/15 px-4 py-3 hover:border-[#c9a24a]/40"
            >
              <span className="text-[#ede6da]">{c.alias}</span>
              <span className="text-xs text-gray-500">{c.consent_state}</span>
            </Link>
          </li>
        ))}
      </ul>
    </ProShell>
  );
}
