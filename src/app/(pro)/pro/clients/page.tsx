"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProShell from "@/modules/pro/ui/ProShell";

type Client = {
  id: string;
  alias: string;
  consent_state: string;
  birth_date: string | null;
  birth_time: string | null;
  birth_place: string | null;
  last_case_at: string | null;
};

export default function ProClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [alias, setAlias] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    const res = await fetch("/api/pro/clients", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alias,
        consentConfirmed: consent,
        birthDate: birthDate || null,
        birthTime: birthTime || null,
        birthPlace: birthPlace || null,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(json.error || "Не удалось создать");
      return;
    }
    setAlias("");
    setBirthDate("");
    setBirthTime("");
    setBirthPlace("");
    setConsent(false);
    setNotice("Клиент добавлен — данные подтянутся в новый кейс");
    await load();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Удалить клиента «${name}»?`)) return;
    setBusy(true);
    const res = await fetch(`/api/pro/clients/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      setErr("Не удалось удалить");
      return;
    }
    setNotice("Клиент удалён");
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
      <div className="pro-panel mb-6 space-y-3">
        <p className="text-sm text-[var(--pro-muted)]">
          Дата и место сохраняются в карточке и подставляются в новый кейс.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="pro-label">Псевдоним</span>
            <input
              className="pro-field w-full"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Как называть клиента"
            />
          </label>
          <label className="block text-sm">
            <span className="pro-label">Дата рождения</span>
            <input
              type="date"
              className="pro-field w-full"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="pro-label">Время (если известно)</span>
            <input
              type="time"
              className="pro-field w-full"
              value={birthTime}
              onChange={(e) => setBirthTime(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="pro-label">Город / место</span>
            <input
              className="pro-field w-full"
              value={birthPlace}
              onChange={(e) => setBirthPlace(e.target.value)}
              placeholder="Москва"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-[var(--pro-muted)]">
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
            disabled={!alias.trim() || busy}
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
        <p className="text-sm text-[var(--pro-faint)]">
          Пока нет клиентов — добавьте вручную или отправьте ссылку-анкету.
        </p>
      ) : (
        <ul className="space-y-2">
          {clients.map((c) => (
            <li
              key={c.id}
              className="pro-panel flex flex-wrap items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/pro/clients/${c.id}`}
                  className="text-[var(--pro-text)] hover:text-[var(--pro-accent-light)]"
                >
                  {c.alias}
                </Link>
                <p className="mt-0.5 text-xs text-[var(--pro-faint)]">
                  {c.birth_date
                    ? `др ${String(c.birth_date).slice(0, 10)}`
                    : "дата не указана"}
                  {c.birth_place ? ` · ${c.birth_place}` : ""}
                  {` · ${c.consent_state}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/pro/case/new?clientId=${c.id}`}
                  className="btn-neon px-3 py-1.5 text-xs"
                >
                  Новый кейс
                </Link>
                <Link
                  href={`/pro/clients/${c.id}`}
                  className="rounded border border-[color:var(--pro-border)] px-3 py-1.5 text-xs text-[var(--pro-accent-light)]"
                >
                  Карточка
                </Link>
                <button
                  type="button"
                  className="rounded border border-red-400/25 px-3 py-1.5 text-xs text-red-200/80"
                  disabled={busy}
                  onClick={() => void remove(c.id, c.alias)}
                >
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </ProShell>
  );
}
