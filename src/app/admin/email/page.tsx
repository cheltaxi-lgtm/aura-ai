"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle } from "@/components/admin/AdminShell";

type EmailStatus = {
  configured: boolean;
  setupGaps: string[];
  templates: Array<{ id: string; label: string }>;
  transport: {
    mode: string;
    configured: boolean;
    from: string;
    smtpHost: string;
    smtpUserSet: boolean;
    smtpPassSet: boolean;
    resendKeySet: boolean;
    canSend: boolean;
  };
  mailboxes: Record<string, string>;
  stats24h: { sent: number; failed: number; skipped: number };
  recent: Array<{
    id: string;
    recipient: string;
    subject: string;
    template: string;
    provider: string | null;
    status: string;
    error_message: string | null;
    created_at: string;
  }>;
};

export default function AdminEmailPage() {
  const [data, setData] = useState<EmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState("");

  const load = () => {
    setLoading(true);
    fetch("/api/admin/email")
      .then((r) => r.json())
      .then((d) => setData(d as EmailStatus))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const sendTest = async () => {
    setTesting(true);
    setNotice("");
    const res = await fetch("/api/admin/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = await res.json().catch(() => ({}));
    setTesting(false);
    setNotice(body.sent ? "Тестовое письмо отправлено" : "Не удалось отправить — проверьте SMTP/Resend в .env.local");
    load();
  };

  return (
    <AdminShell>
      <AdminTitle title="Почта" subtitle="Транспорт, служебные ящики и журнал отправок" />

      {data && !data.configured ? (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
          <p className="font-semibold text-amber-200">Почта не настроена — письма не отправляются</p>
          <p className="mt-2 text-amber-100/90">
            На сервере задайте <code className="text-amber-50">RESEND_API_KEY</code> (рекомендуется) или{" "}
            <code className="text-amber-50">SMTP_USER</code> + <code className="text-amber-50">SMTP_PASS</code> в{" "}
            <code className="text-amber-50">/opt/aura-ai/.env.local</code>, затем перезапустите сервис.
          </p>
          {data.setupGaps.length > 0 ? (
            <p className="mt-2 text-xs text-amber-200/80">
              Не задано: {data.setupGaps.join(", ")}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-amber-200/70">
            Инструкция: <code className="text-amber-50">hosting/MAIL-SETUP.md</code>
          </p>
        </div>
      ) : null}

      {loading && !data ? (
        <p className="text-sm text-gray-500">Загрузка…</p>
      ) : data ? (
        <div className="space-y-8">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-sm font-semibold text-white">Транспорт</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-500">Режим</dt>
                <dd className="text-white">{data.transport.mode}</dd>
              </div>
              <div>
                <dt className="text-gray-500">From</dt>
                <dd className="text-white">{data.transport.from}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Resend API</dt>
                <dd className={data.transport.resendKeySet ? "text-green-400" : "text-amber-400"}>
                  {data.transport.resendKeySet ? "настроен" : "не задан"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">SMTP ({data.transport.smtpHost})</dt>
                <dd className={data.transport.smtpUserSet && data.transport.smtpPassSet ? "text-green-400" : "text-amber-400"}>
                  {data.transport.smtpUserSet && data.transport.smtpPassSet
                    ? "настроен"
                    : data.transport.smtpUserSet
                      ? "нужен SMTP_PASS"
                      : "не задан"}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              disabled={testing}
              onClick={() => void sendTest()}
              className="btn-luxe btn-luxe--sm btn-luxe--gold mt-4"
            >
              {testing ? "Отправка…" : "Тестовое письмо себе"}
            </button>
            {notice ? <p className="mt-3 text-sm text-aura-champagne">{notice}</p> : null}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-sm font-semibold text-white">Служебные ящики</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {Object.entries(data.mailboxes).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-4 border-b border-white/5 pb-2">
                  <dt className="text-gray-500">{key}</dt>
                  <dd className="text-right text-gray-200">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-sm font-semibold text-white">Шаблоны писем</h2>
            <ul className="mt-3 space-y-2 text-sm text-gray-300">
              {data.templates.map((tpl) => (
                <li key={tpl.id} className="flex justify-between gap-4 border-b border-white/5 pb-2">
                  <span>{tpl.label}</span>
                  <span className="font-mono text-xs text-gray-500">{tpl.id}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-sm font-semibold text-white">За 24 часа</h2>
            <p className="mt-2 text-sm text-gray-400">
              отправлено {data.stats24h.sent}, ошибок {data.stats24h.failed}, пропущено {data.stats24h.skipped}
            </p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="mb-3 text-sm font-semibold text-white">Последние отправки</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="text-gray-500">
                  <tr>
                    <th className="pb-2 pr-3">Время</th>
                    <th className="pb-2 pr-3">Кому</th>
                    <th className="pb-2 pr-3">Шаблон</th>
                    <th className="pb-2 pr-3">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((row) => (
                    <tr key={row.id} className="border-t border-white/5 text-gray-300">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString("ru-RU")}
                      </td>
                      <td className="py-2 pr-3">{row.recipient}</td>
                      <td className="py-2 pr-3">{row.template}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            row.status === "sent"
                              ? "text-green-400"
                              : row.status === "failed"
                                ? "text-red-400"
                                : "text-gray-500"
                          }
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </AdminShell>
  );
}
