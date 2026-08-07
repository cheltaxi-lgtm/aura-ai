"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ProShell from "@/modules/pro/ui/ProShell";

type Client = {
  id: string;
  alias: string;
  notes: string | null;
  consent_state: string;
  birth_date: string | null;
  birth_time: string | null;
  birth_place: string | null;
  birth_lat: number | null;
  birth_lon: number | null;
  birth_tz: string | null;
};

type CaseRow = {
  id: string;
  type: string;
  status: string;
  question: string | null;
};

export default function ProClientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [alias, setAlias] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(`/api/pro/clients/${params.id}`, {
      credentials: "include",
    });
    if (!res.ok) return;
    const json = await res.json();
    const c = json.client as Client;
    setClient(c);
    setCases(json.cases || []);
    setAlias(c.alias || "");
    setBirthDate(c.birth_date ? String(c.birth_date).slice(0, 10) : "");
    setBirthTime(c.birth_time ? String(c.birth_time).slice(0, 5) : "");
    setBirthPlace(c.birth_place || "");
    setNotes(c.notes || "");
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/pro/clients/${params.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alias,
        notes,
        birthDate: birthDate || null,
        birthTime: birthTime || null,
        birthPlace: birthPlace || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setMsg("Не удалось сохранить");
      return;
    }
    setMsg("Сохранено — подтянется в новый кейс");
    await load();
  }

  async function remove() {
    if (!confirm("Удалить клиента?")) return;
    setBusy(true);
    const res = await fetch(`/api/pro/clients/${params.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setBusy(false);
    if (res.ok) router.push("/pro/clients");
    else setMsg("Не удалось удалить");
  }

  async function archiveCase(id: string) {
    if (!confirm("Архивировать кейс?")) return;
    setBusy(true);
    await fetch(`/api/pro/cases/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    await load();
    setBusy(false);
  }

  if (!client) {
    return (
      <ProShell title="Клиент">
        <p className="text-sm text-gray-400">Загрузка…</p>
      </ProShell>
    );
  }

  return (
    <ProShell title={client.alias}>
      <p className="text-sm text-[var(--pro-muted)]">
        Согласие: {client.consent_state}
      </p>

      <div className="pro-panel mt-6 grid max-w-xl gap-3">
        <label className="text-sm">
          <span className="pro-label">Псевдоним</span>
          <input
            className="pro-field w-full"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="pro-label">Дата рождения</span>
          <input
            type="date"
            className="pro-field w-full"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="pro-label">Время</span>
          <input
            type="time"
            className="pro-field w-full"
            value={birthTime}
            onChange={(e) => setBirthTime(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="pro-label">Место</span>
          <input
            className="pro-field w-full"
            value={birthPlace}
            onChange={(e) => setBirthPlace(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="pro-label">Заметки</span>
          <textarea
            className="pro-field w-full"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-neon px-4 py-2 text-sm"
            disabled={busy}
            onClick={() => void save()}
          >
            Сохранить
          </button>
          <Link
            href={`/pro/case/new?clientId=${client.id}`}
            className="btn-luxe btn-luxe--md btn-luxe--gold px-4"
          >
            Новый кейс
          </Link>
          <button
            type="button"
            className="rounded border border-red-400/30 px-4 py-2 text-sm text-red-200/90"
            disabled={busy}
            onClick={() => void remove()}
          >
            Удалить клиента
          </button>
        </div>
        {msg ? <p className="text-sm text-[#e8c77e]">{msg}</p> : null}
      </div>

      <h2 className="font-display mt-10 mb-3 text-lg text-[#e8c77e]">Кейсы</h2>
      {!cases.length ? (
        <p className="text-sm text-[var(--pro-faint)]">Кейсов пока нет.</p>
      ) : (
        <ul className="space-y-2">
          {cases.map((c) => (
            <li
              key={c.id}
              className="pro-panel flex flex-wrap items-center justify-between gap-2"
            >
              <Link
                href={`/pro/case/${c.id}`}
                className="text-[#ede6da] underline"
              >
                {c.type} · {c.status} · {c.question || "без вопроса"}
              </Link>
              <button
                type="button"
                className="rounded border border-red-400/25 px-3 py-1 text-xs text-red-200/80"
                disabled={busy || c.status === "archived"}
                onClick={() => void archiveCase(c.id)}
              >
                В архив
              </button>
            </li>
          ))}
        </ul>
      )}
    </ProShell>
  );
}
