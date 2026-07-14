"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell, { AdminTitle } from "@/components/admin/AdminShell";

type EmailLogRow = {
  id: string;
  recipient: string;
  subject: string;
  template: string;
  provider: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

type TemplateStat = {
  template: string;
  sent: number;
  failed: number;
  skipped: number;
  total: number;
};

type EmailStatus = {
  configured: boolean;
  setupGaps: string[];
  templates: Array<{ id: string; label: string; category: string; description: string }>;
  cronJobs: Array<{
    id: string;
    label: string;
    schedule: string;
    endpoint: string;
    description: string;
  }>;
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
  stats7d: { sent: number; failed: number; skipped: number };
  byTemplate: TemplateStat[];
  reengagementStats: Array<{ template: string; count: number }>;
  log: { rows: EmailLogRow[]; total: number };
};

const STATUS_LABELS: Record<string, string> = {
  sent: "отправлено",
  failed: "ошибка",
  skipped: "пропущено",
};

const CATEGORY_LABELS: Record<string, string> = {
  transactional: "служебные",
  reminder: "напоминания",
  marketing: "маркетинг",
  support: "поддержка",
  admin: "админ",
};

export default function AdminEmailPage() {
  const [data, setData] = useState<EmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [filterStatus, setFilterStatus] = useState("");
  const [filterTemplate, setFilterTemplate] = useState("");
  const [filterRecipient, setFilterRecipient] = useState("");
  const [logOffset, setLogOffset] = useState(0);

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewId, setPreviewId] = useState("");

  const [purgeDays, setPurgeDays] = useState(30);
  const [purgeStatus, setPurgeStatus] = useState("skipped");
  const [purgeByAge, setPurgeByAge] = useState(false);
  const [purgeAll, setPurgeAll] = useState(false);
  const [purgePreviewCount, setPurgePreviewCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (filterTemplate) params.set("template", filterTemplate);
    if (filterRecipient) params.set("recipient", filterRecipient);
    params.set("offset", String(logOffset));
    params.set("limit", "40");
    try {
      const res = await fetch(`/api/admin/email?${params}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Не удалось загрузить данные");
      const d = (await res.json()) as EmailStatus;
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterTemplate, filterRecipient, logOffset]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/admin/email", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json().catch(() => ({}));
  };

  const refreshPurgePreview = useCallback(async () => {
    const params = new URLSearchParams({ purgePreview: "1" });
    const wipeAll = purgeAll || (!purgeByAge && !purgeStatus);
    if (wipeAll) {
      params.set("purgeAll", "1");
    } else {
      if (purgeByAge) params.set("olderThanDays", String(purgeDays));
      if (purgeStatus) params.set("purgeStatus", purgeStatus);
      else params.set("purgeStatus", "");
    }
    try {
      const res = await fetch(`/api/admin/email?${params}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { count?: number };
      setPurgePreviewCount(typeof data.count === "number" ? data.count : null);
    } catch {
      setPurgePreviewCount(null);
    }
  }, [purgeAll, purgeByAge, purgeDays, purgeStatus]);

  useEffect(() => {
    void refreshPurgePreview();
  }, [refreshPurgePreview]);

  const sendTest = async () => {
    setBusy("test");
    setNotice("");
    const body = await post({});
    setBusy("");
    setNotice(body.sent ? "Тестовое письмо отправлено" : "Не удалось отправить");
    void load();
  };

  const previewTemplate = async (templateId: string) => {
    setBusy(`preview-${templateId}`);
    const body = await post({ action: "preview", templateId });
    setBusy("");
    if (body.html) {
      setPreviewId(templateId);
      setPreviewSubject(body.subject ?? "");
      setPreviewHtml(body.html);
    }
  };

  const sendTemplateTest = async (templateId: string) => {
    setBusy(`send-${templateId}`);
    setNotice("");
    const body = await post({ action: "send_template", templateId });
    setBusy("");
    setNotice(body.sent ? `Шаблон «${templateId}» отправлен на ${body.to}` : "Ошибка отправки");
    void load();
  };

  const runReengagement = async () => {
    setBusy("reengagement");
    setNotice("");
    const body = await post({ action: "run_reengagement" });
    setBusy("");
    setNotice(
      `Re-engagement: бонус ${body.dailyBonus ?? 0}, 7д ${body.inactive7d ?? 0}, 14д ${body.inactive14d ?? 0}`
    );
    void load();
  };

  const purgeLogs = async () => {
    const scope = purgeAll
      ? "весь журнал"
      : purgeByAge
        ? `старше ${purgeDays} дней`
        : "все подходящие";
    const statusLabel = purgeAll ? "все" : purgeStatus || "любой статус";
    const preview =
      purgePreviewCount != null ? `\nБудет удалено: ${purgePreviewCount} записей.` : "";
    if (!confirm(`Удалить записи email_log (${scope}, статус: ${statusLabel})?${preview}`)) {
      return;
    }
    setBusy("purge");
    setNotice("");
    const payload: Record<string, unknown> = { action: "purge_logs" };
    const wipeAll = purgeAll || (!purgeByAge && !purgeStatus);
    if (wipeAll) {
      payload.purgeAll = true;
    } else {
      if (purgeByAge) payload.olderThanDays = purgeDays;
      if (purgeStatus) payload.status = purgeStatus;
    }
    const body = await post(payload);
    setBusy("");
    if (typeof body.deleted !== "number") {
      setNotice(body.error ?? "Сервер не выполнил очистку — обновите страницу (Ctrl+F5)");
      return;
    }
    setLogOffset(0);
    setNotice(
      body.deleted > 0
        ? `Удалено записей: ${body.deleted}`
        : "Подходящих записей не найдено — проверьте фильтры"
    );
    void load();
    void refreshPurgePreview();
  };

  const applyFilters = () => {
    setLogOffset(0);
    void load();
  };

  return (
    <AdminShell>
      <AdminTitle title="Почта" subtitle="SMTP, шаблоны, кампании возврата и журнал отправок" />

      {data && !data.configured ? (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
          <p className="font-semibold text-amber-200">Почта не настроена — письма не отправляются</p>
          <p className="mt-2 text-amber-100/90">
            Задайте <code className="text-amber-50">SMTP_USER</code> + <code className="text-amber-50">SMTP_PASS</code>{" "}
            или <code className="text-amber-50">RESEND_API_KEY</code> в <code className="text-amber-50">.env.local</code>.
          </p>
          {data.setupGaps.length > 0 ? (
            <p className="mt-2 text-xs text-amber-200/80">Не задано: {data.setupGaps.join(", ")}</p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
      {notice ? <p className="mb-4 text-sm text-aura-champagne">{notice}</p> : null}

      {loading && !data ? (
        <p className="text-sm text-gray-500">Загрузка…</p>
      ) : data ? (
        <div className="space-y-8">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "24 ч — отправлено", value: data.stats24h.sent, color: "text-green-400" },
              { label: "24 ч — ошибки", value: data.stats24h.failed, color: "text-red-400" },
              { label: "7 д — отправлено", value: data.stats7d.sent, color: "text-green-400" },
              { label: "7 д — пропущено", value: data.stats7d.skipped, color: "text-gray-400" },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs text-gray-500">{card.label}</p>
                <p className={`mt-1 text-2xl font-semibold ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </section>

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
                <dt className="text-gray-500">SMTP</dt>
                <dd
                  className={
                    data.transport.smtpUserSet && data.transport.smtpPassSet
                      ? "text-green-400"
                      : "text-amber-400"
                  }
                >
                  {data.transport.smtpUserSet && data.transport.smtpPassSet ? "настроен" : "не готов"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Resend</dt>
                <dd className={data.transport.resendKeySet ? "text-green-400" : "text-gray-500"}>
                  {data.transport.resendKeySet ? "настроен" : "не задан"}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void sendTest()}
                className="btn-luxe btn-luxe--sm btn-luxe--gold"
              >
                {busy === "test" ? "Отправка…" : "Тест себе"}
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void runReengagement()}
                className="btn-luxe btn-luxe--sm"
              >
                {busy === "reengagement" ? "Запуск…" : "Запустить re-engagement"}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-sm font-semibold text-white">Cron-кампании</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {data.cronJobs.map((job) => (
                <li key={job.id} className="rounded-xl border border-white/5 bg-black/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-white">{job.label}</span>
                    <span className="font-mono text-xs text-gray-500">{job.endpoint}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">{job.schedule}</p>
                  <p className="mt-1 text-xs text-gray-500">{job.description}</p>
                </li>
              ))}
            </ul>
            {data.reengagementStats.length > 0 ? (
              <div className="mt-4 border-t border-white/5 pt-3">
                <p className="text-xs font-medium text-gray-400">Re-engagement за 30 дней</p>
                <ul className="mt-2 flex flex-wrap gap-3 text-xs text-gray-300">
                  {data.reengagementStats.map((s) => (
                    <li key={s.template}>
                      <span className="font-mono text-gray-500">{s.template}</span>: {s.count}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-sm font-semibold text-white">По шаблонам (7 дней)</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-xs">
                <thead className="text-gray-500">
                  <tr>
                    <th className="pb-2 pr-3">Шаблон</th>
                    <th className="pb-2 pr-3">Всего</th>
                    <th className="pb-2 pr-3 text-green-400">OK</th>
                    <th className="pb-2 pr-3 text-red-400">Ошибки</th>
                    <th className="pb-2">Пропуск</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byTemplate.map((row) => (
                    <tr key={row.template} className="border-t border-white/5 text-gray-300">
                      <td className="py-2 pr-3 font-mono">{row.template}</td>
                      <td className="py-2 pr-3">{row.total}</td>
                      <td className="py-2 pr-3 text-green-400">{row.sent}</td>
                      <td className="py-2 pr-3 text-red-400">{row.failed}</td>
                      <td className="py-2 text-gray-500">{row.skipped}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-sm font-semibold text-white">Шаблоны писем</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {data.templates.map((tpl) => (
                <li
                  key={tpl.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2"
                >
                  <div>
                    <span className="text-gray-200">{tpl.label}</span>
                    <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-500">
                      {CATEGORY_LABELS[tpl.category] ?? tpl.category}
                    </span>
                    <p className="text-xs text-gray-500">{tpl.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => void previewTemplate(tpl.id)}
                      className="text-xs text-aura-gold hover:underline"
                    >
                      Превью
                    </button>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => void sendTemplateTest(tpl.id)}
                      className="text-xs text-gray-400 hover:underline"
                    >
                      Тест
                    </button>
                    <span className="font-mono text-xs text-gray-600">{tpl.id}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {previewHtml ? (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-sm font-semibold text-white">
                  Превью: {previewId} — {previewSubject}
                </h2>
                <button
                  type="button"
                  onClick={() => setPreviewHtml(null)}
                  className="text-xs text-gray-500 hover:text-white"
                >
                  Закрыть
                </button>
              </div>
              <div
                className="mt-4 overflow-auto rounded-xl bg-white p-4 text-black"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </section>
          ) : null}

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
            <h2 className="mb-3 text-sm font-semibold text-white">Журнал отправок</h2>
            <div className="mb-4 flex flex-wrap items-end gap-3 text-sm">
              <label className="text-xs text-gray-500">
                Статус
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="mt-1 block rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white"
                >
                  <option value="">Все</option>
                  <option value="sent">sent</option>
                  <option value="failed">failed</option>
                  <option value="skipped">skipped</option>
                </select>
              </label>
              <label className="text-xs text-gray-500">
                Шаблон
                <select
                  value={filterTemplate}
                  onChange={(e) => setFilterTemplate(e.target.value)}
                  className="mt-1 block rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white"
                >
                  <option value="">Все</option>
                  {data.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-500">
                Получатель
                <input
                  value={filterRecipient}
                  onChange={(e) => setFilterRecipient(e.target.value)}
                  placeholder="email…"
                  className="mt-1 block rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white"
                />
              </label>
              <button type="button" onClick={applyFilters} className="btn-luxe btn-luxe--sm">
                Применить
              </button>
            </div>

            <p className="mb-2 text-xs text-gray-500">
              Показано {data.log.rows.length} из {data.log.total}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="text-gray-500">
                  <tr>
                    <th className="pb-2 pr-3">Время</th>
                    <th className="pb-2 pr-3">Кому</th>
                    <th className="pb-2 pr-3">Тема</th>
                    <th className="pb-2 pr-3">Шаблон</th>
                    <th className="pb-2 pr-3">Статус</th>
                    <th className="pb-2">Ошибка</th>
                  </tr>
                </thead>
                <tbody>
                  {data.log.rows.map((row) => (
                    <tr key={row.id} className="border-t border-white/5 text-gray-300">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString("ru-RU")}
                      </td>
                      <td className="py-2 pr-3 max-w-[140px] truncate">{row.recipient}</td>
                      <td className="py-2 pr-3 max-w-[180px] truncate">{row.subject}</td>
                      <td className="py-2 pr-3 font-mono">{row.template}</td>
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
                          {STATUS_LABELS[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="py-2 max-w-[200px] truncate text-red-300/80">
                        {row.error_message ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={logOffset <= 0}
                onClick={() => setLogOffset((o) => Math.max(0, o - 40))}
                className="btn-luxe btn-luxe--sm"
              >
                Назад
              </button>
              <button
                type="button"
                disabled={logOffset + 40 >= data.log.total}
                onClick={() => setLogOffset((o) => o + 40)}
                className="btn-luxe btn-luxe--sm"
              >
                Далее
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
            <h2 className="text-sm font-semibold text-red-200">Очистка журнала</h2>
            <p className="mt-1 text-xs text-gray-400">
              Удаляет записи email_log. Чтобы очистить журнал полностью — включите «Удалить весь журнал».
            </p>
            {purgePreviewCount != null ? (
              <p className="mt-2 text-xs text-aura-champagne/80">
                Под фильтр попадает: {purgePreviewCount} записей
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-red-200/90">
                <input
                  type="checkbox"
                  checked={purgeAll}
                  onChange={(e) => {
                    setPurgeAll(e.target.checked);
                    if (e.target.checked) setPurgeByAge(false);
                  }}
                  className="rounded border-white/20"
                />
                Удалить весь журнал
              </label>
              {!purgeAll ? (
                <>
                  <label className="text-xs text-gray-500">
                    Статус
                    <select
                      value={purgeStatus}
                      onChange={(e) => setPurgeStatus(e.target.value)}
                      className="mt-1 block rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white"
                    >
                      <option value="skipped">skipped</option>
                      <option value="failed">failed</option>
                      <option value="sent">sent</option>
                      <option value="">все статусы (весь журнал)</option>
                    </select>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-400">
                    <input
                      type="checkbox"
                      checked={purgeByAge}
                      onChange={(e) => setPurgeByAge(e.target.checked)}
                      className="rounded border-white/20"
                    />
                    Только старше
                  </label>
                  {purgeByAge ? (
                    <label className="text-xs text-gray-500">
                      Дней
                      <input
                        type="number"
                        min={1}
                        value={purgeDays}
                        onChange={(e) => setPurgeDays(Number(e.target.value))}
                        className="mt-1 block w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white"
                      />
                    </label>
                  ) : null}
                </>
              ) : null}
              <button
                type="button"
                disabled={busy === "purge" || purgePreviewCount === 0}
                onClick={() => void purgeLogs()}
                className="btn-luxe btn-luxe--sm text-red-200"
              >
                {busy === "purge" ? "Удаление…" : "Удалить записи"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </AdminShell>
  );
}
