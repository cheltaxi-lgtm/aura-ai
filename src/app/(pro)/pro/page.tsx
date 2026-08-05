"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProShell from "@/modules/pro/ui/ProShell";

type AccountResp = {
  ok: boolean;
  account: {
    id: string;
    status: string;
    display_name: string | null;
    brand_slug: string | null;
    specializations?: string[];
    bio?: string | null;
  } | null;
  runeBalance?: number;
  billingMode?: string;
  usage?: { shadowRunes: number; liveRunes: number; events: number };
  error?: string;
  code?: string;
};

const SPEC_OPTIONS = [
  "Таро",
  "Астрология",
  "Нумерология",
  "Матрица судьбы",
  "Руны",
  "Ленорман",
] as const;

export default function ProHomePage() {
  const [data, setData] = useState<AccountResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [unauth, setUnauth] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [specs, setSpecs] = useState<string[]>([]);
  const [customSpec, setCustomSpec] = useState("");
  const [bio, setBio] = useState("");

  async function load() {
    const res = await fetch("/api/pro/account", { credentials: "include" });
    if (res.status === 404) {
      setErr("Модуль Pro выключен");
      return;
    }
    if (res.status === 401) {
      setUnauth(true);
      setData({ ok: false, account: null });
      return;
    }
    const json = (await res.json()) as AccountResp;
    setData(json);
    setUnauth(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function toggleSpec(name: string) {
    setSpecs((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name].slice(0, 12)
    );
  }

  async function apply() {
    setBusy(true);
    setErr(null);
    const fromCustom = customSpec
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const specializations = [...new Set([...specs, ...fromCustom])].slice(0, 12);
    if (!displayName.trim()) {
      setBusy(false);
      setErr("Укажите отображаемое имя");
      return;
    }
    const res = await fetch("/api/pro/account", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: displayName.trim(),
        specializations,
        bio: bio.trim().slice(0, 2000) || undefined,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (res.status === 401) {
      setUnauth(true);
      setErr("Войдите в аккаунт, чтобы подать заявку");
      return;
    }
    if (!res.ok) {
      setErr(json.message || json.error || "Ошибка заявки");
      return;
    }
    await load();
  }

  if (unauth) {
    return (
      <ProShell variant="gate" title="Кабинет практика">
        <div className="pro-gate__card">
          <p className="pro-gate__lead">
            Войдите обычным аккаунтом Zovus — затем подайте заявку в Pro.
          </p>
          <Link
            href="/auth?returnTo=/pro"
            className="btn-luxe btn-luxe--md btn-luxe--gold mt-6 inline-flex w-full justify-center"
          >
            Войти или создать аккаунт
          </Link>
          <p className="pro-gate__foot">
            <Link href="/zovus-pro">Что такое Zovus Pro</Link>
          </p>
          {err && <p className="pro-gate__error">{err}</p>}
        </div>
      </ProShell>
    );
  }

  if (err && !data) {
    return (
      <ProShell variant="gate">
        <div className="pro-gate__card">
          <p className="pro-gate__error">{err}</p>
        </div>
      </ProShell>
    );
  }

  if (!data) {
    return (
      <ProShell variant="gate">
        <div className="pro-gate__card pro-gate__card--loading">
          <p className="pro-gate__lead">Загрузка…</p>
        </div>
      </ProShell>
    );
  }

  if (!data.account) {
    return (
      <ProShell variant="gate" title="Заявка в Pro">
        <div className="pro-gate__card">
          <p className="pro-gate__lead">
            Расскажите о практике. После одобрения откроются клиенты, кейсы и
            выдача отчётов.
          </p>

          <form
            className="pro-apply"
            onSubmit={(e) => {
              e.preventDefault();
              void apply();
            }}
          >
            <label className="pro-apply__field" htmlFor="pro-display-name">
              <span className="pro-apply__label">Отображаемое имя</span>
              <input
                id="pro-display-name"
                className="pro-apply__input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Как вас видят клиенты"
                maxLength={80}
                autoComplete="name"
                required
              />
            </label>

            <fieldset className="pro-apply__field">
              <legend className="pro-apply__label">Специализации</legend>
              <div className="pro-apply__chips" role="group" aria-label="Специализации">
                {SPEC_OPTIONS.map((name) => {
                  const on = specs.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      className={
                        on
                          ? "pro-apply__chip pro-apply__chip--on"
                          : "pro-apply__chip"
                      }
                      aria-pressed={on}
                      onClick={() => toggleSpec(name)}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              <input
                className="pro-apply__input pro-apply__input--subtle"
                value={customSpec}
                onChange={(e) => setCustomSpec(e.target.value)}
                placeholder="Другое — через запятую"
                maxLength={120}
              />
            </fieldset>

            <label className="pro-apply__field" htmlFor="pro-bio">
              <span className="pro-apply__label">
                О практике
                <span className="pro-apply__optional">необязательно</span>
              </span>
              <textarea
                id="pro-bio"
                className="pro-apply__input pro-apply__textarea"
                rows={4}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Кратко о подходе и опыте"
                maxLength={2000}
              />
            </label>

            {err && <p className="pro-gate__error">{err}</p>}

            <button
              type="submit"
              disabled={busy}
              className="btn-luxe btn-luxe--md btn-luxe--gold w-full justify-center disabled:opacity-60"
            >
              {busy ? "Отправка…" : "Подать заявку"}
            </button>

            <p className="pro-gate__foot">
              Нажимая кнопку, вы принимаете{" "}
              <Link href="/offer-pro">оферту Zovus Pro</Link>.
            </p>
          </form>
        </div>
      </ProShell>
    );
  }

  if (data.account.status === "pending") {
    return (
      <ProShell variant="gate" title="Заявка на рассмотрении">
        <div className="pro-gate__card">
          <div className="pro-gate__status">
            <span className="pro-gate__status-dot" aria-hidden />
            Ожидает одобрения
          </div>
          <p className="pro-gate__lead mt-4">
            Профиль{" "}
            <strong className="text-aura-ivory">
              {data.account.display_name || "Практик"}
            </strong>{" "}
            создан. Когда админ откроет доступ, кабинет появится здесь — письмо
            придёт на email аккаунта.
          </p>
          <Link href="/" className="btn-ghost mt-6 inline-flex w-full justify-center py-2.5 text-sm">
            На главную
          </Link>
        </div>
      </ProShell>
    );
  }

  if (data.account.status === "suspended" || data.account.status === "closed") {
    return (
      <ProShell variant="gate" title="Доступ ограничен">
        <div className="pro-gate__card">
          <p className="pro-gate__lead">
            Статус аккаунта: <strong>{data.account.status}</strong>. Напишите в{" "}
            <Link href="/cabinet/support">поддержку</Link>, если это ошибка.
          </p>
        </div>
      </ProShell>
    );
  }

  return (
    <ProShell title={data.account.display_name || "Кабинет"}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="pro-panel">
          <p className="text-xs text-[var(--pro-faint)]">Баланс ᚢ</p>
          <p className="font-display text-2xl text-aura-champagne">
            {data.runeBalance ?? "—"}
          </p>
          <p className="mt-1 text-xs text-[var(--pro-faint)]">
            режим {data.billingMode}
          </p>
        </div>
        <div className="pro-panel">
          <p className="text-xs text-[var(--pro-faint)]">Списания (shadow / live)</p>
          <p className="font-display text-2xl text-aura-ivory">
            {data.usage?.shadowRunes ?? 0} / {data.usage?.liveRunes ?? 0}
          </p>
          <p className="mt-1 text-xs text-[var(--pro-faint)]">
            {data.usage?.events ?? 0} событий
          </p>
        </div>
        <div className="pro-panel">
          <p className="text-xs text-[var(--pro-faint)]">Slug</p>
          <p className="font-display text-lg text-aura-ivory">
            {data.account.brand_slug || "—"}
          </p>
        </div>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/pro/clients"
          className="btn-luxe btn-luxe--md btn-luxe--gold px-5"
        >
          Клиенты
        </Link>
        <Link href="/pro/case/new" className="btn-ghost px-5 py-2.5 text-sm">
          Новый кейс
        </Link>
        <Link href="/pro/inbox" className="btn-ghost px-5 py-2.5 text-sm">
          Входящие
        </Link>
      </div>
    </ProShell>
  );
}
