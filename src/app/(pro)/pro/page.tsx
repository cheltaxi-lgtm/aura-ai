"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatProDateOnly } from "@/modules/pro/adapters/date-only";
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

type CaseRow = {
  id: string;
  type: string;
  status: string;
  question: string | null;
  client_alias?: string | null;
  updated_at?: string;
};
type ClientRow = {
  id: string;
  alias: string;
  birth_date?: string | null;
  last_case_at?: string | null;
};

const STATUS_RU: Record<string, string> = {
  new: "Новый",
  input_ready: "Данные",
  generating: "Генерация",
  draft: "Черновик",
  edited: "Принят",
  delivered: "Выдан",
  archived: "Архив",
  failed: "Ошибка",
};

const TYPE_RU: Record<string, string> = {
  natal: "Натал",
  matrix: "Матрица",
  hd: "HD",
  manual_spread: "Расклад",
};

export default function ProHomePage() {
  const [data, setData] = useState<AccountResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [unauth, setUnauth] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [specs, setSpecs] = useState<string[]>([]);
  const [customSpec, setCustomSpec] = useState("");
  const [bio, setBio] = useState("");
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [dashBusy, setDashBusy] = useState(false);

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
    if (json.account?.status === "active") {
      void loadDesk();
    }
  }

  async function loadDesk() {
    const [cRes, clRes] = await Promise.all([
      fetch("/api/pro/cases", { credentials: "include" }),
      fetch("/api/pro/clients", { credentials: "include" }),
    ]);
    if (cRes.ok) {
      const j = await cRes.json();
      setCases(j.cases || []);
    }
    if (clRes.ok) {
      const j = await clRes.json();
      setClients(j.clients || []);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function archiveCase(id: string) {
    if (
      !confirm(
        "Архивировать кейс? Ссылка мини-лендинга для клиента будет отключена."
      )
    )
      return;
    setDashBusy(true);
    await fetch(`/api/pro/cases/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    await loadDesk();
    setDashBusy(false);
  }

  async function deleteClient(id: string, alias: string) {
    if (!confirm(`Удалить клиента «${alias}»? Кейсы останутся в архиве списка.`))
      return;
    setDashBusy(true);
    await fetch(`/api/pro/clients/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    await loadDesk();
    setDashBusy(false);
  }

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

  const landingHref = data.account.brand_slug
    ? `/p/${data.account.brand_slug}`
    : "/pro/landing";

  return (
    <ProShell title={data.account.display_name || "Кабинет"}>
      <p className="mb-6 max-w-2xl text-sm text-[var(--pro-muted)]">
        Рабочий стол практика: клиенты, практики сайта с графикой, ссылка и PDF.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="pro-panel">
          <p className="text-xs uppercase tracking-wider text-[var(--pro-faint)]">
            Баланс
          </p>
          <p className="font-display mt-1 text-2xl text-aura-champagne">
            {data.runeBalance ?? "—"} ᚢ
          </p>
        </div>
        <div className="pro-panel">
          <p className="text-xs uppercase tracking-wider text-[var(--pro-faint)]">
            Клиенты
          </p>
          <p className="font-display mt-1 text-2xl text-aura-ivory">
            {clients.length}
          </p>
        </div>
        <div className="pro-panel">
          <p className="text-xs uppercase tracking-wider text-[var(--pro-faint)]">
            Активные кейсы
          </p>
          <p className="font-display mt-1 text-2xl text-aura-ivory">
            {cases.length}
          </p>
        </div>
        <div className="pro-panel">
          <p className="text-xs uppercase tracking-wider text-[var(--pro-faint)]">
            Минилендинг
          </p>
          <p className="mt-1 truncate font-display text-lg text-aura-ivory">
            {data.account.brand_slug ? `/${data.account.brand_slug}` : "не задан"}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/pro/case/new"
          className="btn-luxe btn-luxe--md btn-luxe--gold px-5"
        >
          Новая практика
        </Link>
        <Link href="/pro/clients" className="btn-neon px-4 py-2.5 text-sm">
          Клиенты
        </Link>
        <Link href="/pro/inbox" className="btn-ghost px-4 py-2.5 text-sm">
          Входящие
        </Link>
        <Link href="/pro/landing" className="btn-ghost px-4 py-2.5 text-sm">
          Минилендинг
        </Link>
        <Link
          href={landingHref}
          className="btn-ghost px-4 py-2.5 text-sm"
          target={data.account.brand_slug ? "_blank" : undefined}
        >
          Открыть /p
        </Link>
        <Link href="/pro/billing" className="btn-ghost px-4 py-2.5 text-sm">
          Биллинг
        </Link>
        <Link href="/pro/settings" className="btn-ghost px-4 py-2.5 text-sm">
          Настройки
        </Link>
      </div>

      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-display text-xl text-[#e8c77e]">Кейсы</h2>
          <Link
            href="/pro/case/new"
            className="text-xs text-[var(--pro-accent-light)] underline"
          >
            + Новый
          </Link>
        </div>
        {!cases.length ? (
          <div className="pro-panel text-sm text-[var(--pro-muted)]">
            Пока нет кейсов. Создайте практику для клиента — натал, матрица или HD.
          </div>
        ) : (
          <ul className="space-y-2">
            {cases.slice(0, 12).map((c) => (
              <li
                key={c.id}
                className="pro-panel flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/pro/case/${c.id}`}
                    className="font-medium text-[var(--pro-text)] hover:text-[var(--pro-accent-light)]"
                  >
                    {c.client_alias || "Клиент"} · {TYPE_RU[c.type] || c.type}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-[var(--pro-faint)]">
                    {STATUS_RU[c.status] || c.status}
                    {c.question ? ` · ${c.question}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/pro/case/${c.id}`}
                    className="rounded border border-[color:var(--pro-border)] px-3 py-1.5 text-xs text-[var(--pro-accent-light)]"
                  >
                    Открыть
                  </Link>
                  <button
                    type="button"
                    className="rounded border border-red-400/25 px-3 py-1.5 text-xs text-red-200/80"
                    disabled={dashBusy}
                    onClick={() => void archiveCase(c.id)}
                  >
                    В архив
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-display text-xl text-[#e8c77e]">Клиенты</h2>
          <Link
            href="/pro/clients"
            className="text-xs text-[var(--pro-accent-light)] underline"
          >
            Все клиенты
          </Link>
        </div>
        {!clients.length ? (
          <div className="pro-panel text-sm text-[var(--pro-muted)]">
            Добавьте клиента или отправьте ссылку-анкету.
          </div>
        ) : (
          <ul className="space-y-2">
            {clients.slice(0, 8).map((cl) => (
              <li
                key={cl.id}
                className="pro-panel flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <Link
                    href={`/pro/clients/${cl.id}`}
                    className="font-medium text-[var(--pro-text)] hover:text-[var(--pro-accent-light)]"
                  >
                    {cl.alias}
                  </Link>
                  <p className="mt-0.5 text-xs text-[var(--pro-faint)]">
                    {formatProDateOnly(cl.birth_date)
                      ? `др ${formatProDateOnly(cl.birth_date)}`
                      : "дата не указана"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/pro/case/new?clientId=${cl.id}`}
                    className="btn-neon px-3 py-1.5 text-xs"
                  >
                    Новый кейс
                  </Link>
                  <Link
                    href={`/pro/clients/${cl.id}`}
                    className="rounded border border-[color:var(--pro-border)] px-3 py-1.5 text-xs text-[var(--pro-accent-light)]"
                  >
                    Карточка
                  </Link>
                  <button
                    type="button"
                    className="rounded border border-red-400/25 px-3 py-1.5 text-xs text-red-200/80"
                    disabled={dashBusy}
                    onClick={() => void deleteClient(cl.id, cl.alias)}
                  >
                    Удалить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </ProShell>
  );
}
