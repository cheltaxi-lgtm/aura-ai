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
  } | null;
  runeBalance?: number;
  billingMode?: string;
  usage?: { shadowRunes: number; liveRunes: number; events: number };
  error?: string;
};

export default function ProHomePage() {
  const [data, setData] = useState<AccountResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/pro/account", { credentials: "include" });
    if (res.status === 404) {
      setErr("Модуль Pro выключен");
      return;
    }
    const json = (await res.json()) as AccountResp;
    setData(json);
  }

  useEffect(() => {
    void load();
  }, []);

  async function apply() {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/pro/account", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Практик" }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(json.message || json.error || "Ошибка заявки");
      return;
    }
    await load();
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
        <p className="mb-4 max-w-lg text-sm text-gray-300">
          Кабинет для практикующих: клиенты, кейсы, черновики ИИ и выдача отчётов.
          Доступ после одобрения (или allowlist).
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void apply()}
          className="btn-neon px-6 py-2 text-sm"
        >
          {busy ? "Отправка…" : "Подать заявку"}
        </button>
        {err && <p className="mt-3 text-sm text-red-300">{err}</p>}
      </ProShell>
    );
  }

  if (data.account.status === "pending") {
    return (
      <ProShell title="Заявка на рассмотрении">
        <p className="text-sm text-gray-300">
          Аккаунт создан со статусом <strong>pending</strong>. После одобрения
          админом откроется кабинет.
        </p>
      </ProShell>
    );
  }

  return (
    <ProShell title={data.account.display_name || "Кабинет"}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-[#c9a24a]/20 p-4">
          <p className="text-xs text-gray-500">Баланс ᚢ</p>
          <p className="font-display text-2xl text-[#e8c77e]">
            {data.runeBalance ?? "—"}
          </p>
          <p className="mt-1 text-xs text-gray-500">режим {data.billingMode}</p>
        </div>
        <div className="rounded-lg border border-[#c9a24a]/20 p-4">
          <p className="text-xs text-gray-500">Usage (shadow / live)</p>
          <p className="font-display text-2xl text-[#ede6da]">
            {data.usage?.shadowRunes ?? 0} / {data.usage?.liveRunes ?? 0}
          </p>
          <p className="mt-1 text-xs text-gray-500">{data.usage?.events ?? 0} событий</p>
        </div>
        <div className="rounded-lg border border-[#c9a24a]/20 p-4">
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
