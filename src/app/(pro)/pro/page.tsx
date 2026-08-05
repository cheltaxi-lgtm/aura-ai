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

const SPEC_HINT = "Таро, Астрология, Нумерология";

export default function ProHomePage() {
  const [data, setData] = useState<AccountResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [unauth, setUnauth] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [specializations, setSpecializations] = useState("");
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

  async function apply() {
    setBusy(true);
    setErr(null);
    const specs = specializations
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
    const res = await fetch("/api/pro/account", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: displayName.trim() || "Практик",
        specializations: specs,
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
      <ProShell title="Zovus Pro">
        <p className="mb-4 max-w-lg text-sm text-gray-300">
          Кабинет практика доступен после входа обычным аккаунтом Zovus.
        </p>
        <Link
          href="/auth?returnTo=/pro"
          className="btn-neon inline-flex px-6 py-2 text-sm"
        >
          Войти или создать аккаунт
        </Link>
        {err && <p className="mt-3 text-sm text-red-300">{err}</p>}
      </ProShell>
    );
  }

  if (err && !data) {
    return (
      <ProShell>
        <p className="text-sm text-red-300">{err}</p>
      </ProShell>
    );
  }

  if (!data) {
    return (
      <ProShell>
        <p className="text-sm text-gray-400">Загрузка…</p>
      </ProShell>
    );
  }

  if (!data.account) {
    return (
      <ProShell title="Заявка в Pro">
        <p className="mb-6 max-w-lg text-sm text-gray-300">
          Кабинет для практикующих: клиенты, кейсы, черновики ИИ и выдача отчётов.
          Доступ после одобрения (или allowlist).
        </p>
        <form
          className="flex max-w-lg flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void apply();
          }}
        >
          <div>
            <label className="pro-label" htmlFor="pro-display-name">
              Отображаемое имя
            </label>
            <input
              id="pro-display-name"
              className="pro-field"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Как вас видят клиенты"
              maxLength={80}
              required
            />
          </div>
          <div>
            <label className="pro-label" htmlFor="pro-specs">
              Специализации
            </label>
            <input
              id="pro-specs"
              className="pro-field"
              value={specializations}
              onChange={(e) => setSpecializations(e.target.value)}
              placeholder={SPEC_HINT}
            />
            <p className="mt-1 text-xs text-gray-500">Через запятую</p>
          </div>
          <div>
            <label className="pro-label" htmlFor="pro-bio">
              О практике
            </label>
            <textarea
              id="pro-bio"
              className="pro-field"
              rows={4}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Кратко о подходе и опыте"
              maxLength={2000}
            />
          </div>
          <button type="submit" disabled={busy} className="btn-neon px-6 py-2 text-sm">
            {busy ? "Отправка…" : "Подать заявку"}
          </button>
          {err && <p className="text-sm text-red-300">{err}</p>}
          <p className="text-xs text-gray-500">
            Подавая заявку, вы принимаете{" "}
            <Link href="/offer-pro" className="text-aura-champagne/80 underline-offset-2 hover:underline">
              оферту Zovus Pro
            </Link>
            .
          </p>
        </form>
      </ProShell>
    );
  }

  if (data.account.status === "pending") {
    return (
      <ProShell title="Заявка на рассмотрении">
        <div className="pro-panel max-w-lg">
          <p className="text-sm text-gray-300">
            Аккаунт <strong>{data.account.display_name || "Практик"}</strong> создан со
            статусом <strong>на рассмотрении</strong>. После одобрения админом откроется
            кабинет — мы пришлём письмо, если email указан в профиле.
          </p>
        </div>
      </ProShell>
    );
  }

  if (data.account.status === "suspended" || data.account.status === "closed") {
    return (
      <ProShell title="Доступ ограничен">
        <p className="text-sm text-gray-300">
          Статус аккаунта: <strong>{data.account.status}</strong>. Напишите в поддержку,
          если это ошибка.
        </p>
      </ProShell>
    );
  }

  return (
    <ProShell title={data.account.display_name || "Кабинет"}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="pro-panel">
          <p className="text-xs text-gray-500">Баланс ᚢ</p>
          <p className="font-display text-2xl text-[#e8c77e]">
            {data.runeBalance ?? "—"}
          </p>
          <p className="mt-1 text-xs text-gray-500">режим {data.billingMode}</p>
        </div>
        <div className="pro-panel">
          <p className="text-xs text-gray-500">Usage (shadow / live)</p>
          <p className="font-display text-2xl text-[#ede6da]">
            {data.usage?.shadowRunes ?? 0} / {data.usage?.liveRunes ?? 0}
          </p>
          <p className="mt-1 text-xs text-gray-500">{data.usage?.events ?? 0} событий</p>
        </div>
        <div className="pro-panel">
          <p className="text-xs text-gray-500">Slug</p>
          <p className="font-display text-lg text-[#ede6da]">
            {data.account.brand_slug || "—"}
          </p>
        </div>
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/pro/clients" className="btn-neon px-5 py-2 text-sm">
          Клиенты
        </Link>
        <Link href="/pro/case/new" className="btn-neon px-5 py-2 text-sm">
          Новый кейс
        </Link>
        <Link href="/pro/inbox" className="btn-neon px-5 py-2 text-sm">
          Входящие
        </Link>
      </div>
    </ProShell>
  );
}
