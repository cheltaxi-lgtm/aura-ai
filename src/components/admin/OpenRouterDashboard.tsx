"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Cpu,
  DollarSign,
  KeyRound,
  RefreshCw,
  TrendingDown,
  XCircle,
} from "lucide-react";

type Forecast = {
  available: boolean;
  reason: string | null;
  balanceUsd: number | null;
  balanceSource: "account" | "key_limit" | null;
  dailyBurnUsd: number | null;
  burnMethod: string | null;
  burnMethodLabel: string | null;
  sampleDays: number;
  daysRemaining: number | null;
  depletionDate: string | null;
  projectedWeekSpend: number | null;
  projectedMonthSpend: number | null;
  urgency: "ok" | "warning" | "critical" | "unknown";
};

type Snapshot = {
  fetchedAt: string;
  keyConfigured: boolean;
  keyStatus: "ok" | "missing" | "invalid" | "low_balance" | "error";
  keyStatusMessage: string;
  keyHint: string | null;
  managementKeyConfigured: boolean;
  managementKeyHint: string | null;
  managementKeySource: "env" | "admin" | null;
  managementKeyEditable: boolean;
  key: {
    label: string;
    limit: number | null;
    limitRemaining: number | null;
    limitReset: string | null;
    usageAllTime: number;
    usageDaily: number;
    usageWeekly: number;
    usageMonthly: number;
    byokUsageMonthly: number;
    isFreeTier: boolean;
  } | null;
  credits: { totalCredits: number; totalUsage: number; remaining: number } | null;
  creditsAvailable: boolean;
  creditsNote: string | null;
  activityAvailable: boolean;
  activityNote: string | null;
  forecast: Forecast;
  dailySpend: Array<{ date: string; usageUsd: number; requests: number }>;
  byModel: Array<{
    model: string;
    providerName: string;
    requests: number;
    usageUsd: number;
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
    lastDate: string;
  }>;
  llm: {
    max: number;
    active: number;
    queued: number;
    queueTimeoutMs: number;
    background: { max: number; active: number; queued: number };
  };
  configuredModels: Record<string, string>;
};

function usd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

function daysLabel(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const whole = Math.floor(rounded);
  const mod10 = whole % 10;
  const mod100 = whole % 100;
  let word = "дней";
  if (mod100 < 11 || mod100 > 14) {
    if (mod10 === 1) word = "день";
    else if (mod10 >= 2 && mod10 <= 4) word = "дня";
  }
  return `${rounded.toLocaleString("ru-RU")} ${word}`;
}

function forecastUi(urgency: Forecast["urgency"]) {
  switch (urgency) {
    case "critical":
      return "border-red-500/40 bg-red-500/10";
    case "warning":
      return "border-amber-500/40 bg-amber-500/10";
    case "ok":
      return "border-green-500/30 bg-green-500/5";
    default:
      return "border-white/10 bg-white/[0.03]";
  }
}

function statusUi(status: Snapshot["keyStatus"]) {
  switch (status) {
    case "ok":
      return {
        icon: CheckCircle2,
        color: "text-green-400",
        bg: "border-green-500/30 bg-green-500/10",
        dot: "bg-green-400",
        label: "Активен",
      };
    case "low_balance":
      return {
        icon: AlertTriangle,
        color: "text-amber-400",
        bg: "border-amber-500/30 bg-amber-500/10",
        dot: "bg-amber-400",
        label: "Мало кредитов",
      };
    case "missing":
    case "invalid":
      return {
        icon: XCircle,
        color: "text-red-400",
        bg: "border-red-500/30 bg-red-500/10",
        dot: "bg-red-400",
        label: status === "missing" ? "Не задан" : "Невалиден",
      };
    default:
      return {
        icon: AlertTriangle,
        color: "text-red-400",
        bg: "border-red-500/30 bg-red-500/10",
        dot: "bg-red-400",
        label: "Ошибка",
      };
  }
}

export default function OpenRouterDashboard() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mgmtInput, setMgmtInput] = useState("");
  const [mgmtSaving, setMgmtSaving] = useState(false);
  const [mgmtError, setMgmtError] = useState<string | null>(null);
  const [mgmtSaved, setMgmtSaved] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/admin/openrouter${refresh ? "?refresh=1" : ""}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) setData((await res.json()) as Snapshot);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveManagementKey = async (clear = false) => {
    setMgmtSaving(true);
    setMgmtError(null);
    setMgmtSaved(false);
    try {
      const res = await fetch("/api/admin/openrouter", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managementKey: clear ? "" : mgmtInput.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        snapshot?: Snapshot;
      };
      if (!res.ok) {
        setMgmtError(json.error ?? "Не удалось сохранить ключ");
        return;
      }
      if (json.snapshot) setData(json.snapshot);
      else await load(true);
      setMgmtInput("");
      setMgmtSaved(true);
      setTimeout(() => setMgmtSaved(false), 2500);
    } finally {
      setMgmtSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <section className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-sm text-gray-500">Загрузка OpenRouter…</p>
      </section>
    );
  }

  if (!data) return null;

  const st = statusUi(data.keyStatus);
  const StatusIcon = st.icon;
  const balance =
    data.credits?.remaining ??
    (data.key?.limitRemaining != null ? data.key.limitRemaining : null);

  return (
    <section className="mb-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <Activity className="h-4 w-4 text-aura-gold" />
            OpenRouter — баланс и расходы
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Обновлено {new Date(data.fetchedAt).toLocaleString("ru-RU")}
            {data.keyHint ? ` · ключ ${data.keyHint}` : ""}
          </p>
        </div>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => void load(true)}
          className="btn-luxe btn-luxe--sm inline-flex items-center gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Обновить
        </button>
      </div>

      {!data.activityAvailable || !data.managementKeyConfigured ? (
        <div className="rounded-2xl border border-aura-gold/30 bg-aura-gold/5 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <KeyRound className="h-4 w-4 text-aura-gold" />
            Management API key
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-gray-400">
            Нужен для таблицы по моделям и расхода по дням. Создайте в{" "}
            <a
              href="https://openrouter.ai/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-aura-gold hover:underline"
            >
              openrouter.ai/settings/keys
            </a>{" "}
            → Management API Keys, вставьте сюда и нажмите «Сохранить».
          </p>

          {data.managementKeySource === "env" ? (
            <p className="mt-3 text-sm text-green-400">
              Ключ задан на сервере в .env.local
              {data.managementKeyHint ? ` (${data.managementKeyHint})` : ""} — приоритет над полем ниже.
            </p>
          ) : null}

          {data.managementKeyConfigured && data.managementKeySource === "admin" ? (
            <p className="mt-3 text-sm text-green-400">
              Сохранён в админке
              {data.managementKeyHint ? ` · ${data.managementKeyHint}` : ""}
              {data.activityAvailable ? " · activity OK" : ""}
            </p>
          ) : null}

          {data.managementKeyEditable ? (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-xs text-gray-500">Management key</label>
                <input
                  type="password"
                  value={mgmtInput}
                  onChange={(e) => {
                    setMgmtInput(e.target.value);
                    setMgmtError(null);
                  }}
                  placeholder="sk-or-v1-…"
                  autoComplete="off"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 font-mono text-sm text-white"
                />
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={mgmtSaving || !mgmtInput.trim()}
                  onClick={() => void saveManagementKey(false)}
                  className="btn-neon px-4 py-2.5 text-sm disabled:opacity-50"
                >
                  {mgmtSaving ? "Проверка…" : mgmtSaved ? "Сохранено ✓" : "Сохранить"}
                </button>
                {data.managementKeySource === "admin" ? (
                  <button
                    type="button"
                    disabled={mgmtSaving}
                    onClick={() => void saveManagementKey(true)}
                    className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-gray-400 hover:bg-white/5"
                  >
                    Удалить
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {mgmtError ? <p className="mt-2 text-xs text-red-400">{mgmtError}</p> : null}
          {data.activityNote && !data.activityAvailable ? (
            <p className="mt-2 text-xs text-gray-500">{data.activityNote}</p>
          ) : null}
        </div>
      ) : data.managementKeyConfigured ? (
        <p className="text-xs text-gray-500">
          Management key активен
          {data.managementKeyHint ? ` (${data.managementKeyHint})` : ""}
          {data.managementKeySource === "env" ? " · из .env.local" : " · из админки"}
        </p>
      ) : null}

      <div className={`rounded-2xl border px-4 py-3 ${st.bg}`}>
        <div className="flex flex-wrap items-center gap-3">
          <StatusIcon className={`h-5 w-5 ${st.color}`} />
          <span className={`text-sm font-medium ${st.color}`}>{st.label}</span>
          <span className="text-sm text-gray-300">{data.keyStatusMessage}</span>
          {data.key?.label ? (
            <span className="ml-auto font-mono text-xs text-gray-500">{data.key.label}</span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Баланс / остаток",
            value: balance != null ? usd(balance) : "—",
            sub: data.creditsAvailable
              ? "аккаунт OpenRouter"
              : data.key?.limit != null
                ? `лимит ключа${data.key.limitReset ? ` · ${data.key.limitReset}` : ""}`
                : "без лимита ключа",
            icon: DollarSign,
          },
          {
            label: "Сегодня (UTC)",
            value: usd(data.key?.usageDaily ?? 0),
            sub: `${data.key?.usageDaily ? "по ключу" : "—"}`,
            icon: Activity,
          },
          {
            label: "Неделя (UTC)",
            value: usd(data.key?.usageWeekly ?? 0),
            sub: "с понедельника UTC",
            icon: Activity,
          },
          {
            label: "Месяц (UTC)",
            value: usd(data.key?.usageMonthly ?? 0),
            sub: data.key?.byokUsageMonthly
              ? `BYOK: ${usd(data.key.byokUsageMonthly)}`
              : "текущий месяц UTC",
            icon: Activity,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
          >
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <card.icon className="h-3.5 w-3.5" />
              {card.label}
            </div>
            <p className="mt-2 text-xl font-semibold text-white">{card.value}</p>
            <p className="mt-1 text-[10px] text-gray-500">{card.sub}</p>
          </div>
        ))}
      </div>

      {data.credits ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
            <span className="text-gray-500">Куплено кредитов</span>
            <p className="mt-1 font-semibold text-white">{usd(data.credits.totalCredits)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
            <span className="text-gray-500">Использовано всего</span>
            <p className="mt-1 font-semibold text-white">{usd(data.credits.totalUsage)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
            <span className="text-gray-500">Остаток аккаунта</span>
            <p className="mt-1 font-semibold text-green-400">{usd(data.credits.remaining)}</p>
          </div>
        </div>
      ) : data.creditsNote ? (
        <p className="text-xs text-amber-200/80">{data.creditsNote}</p>
      ) : null}

      <div className={`rounded-2xl border p-5 ${forecastUi(data.forecast.urgency)}`}>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <CalendarClock className="h-4 w-4 text-aura-gold" />
          Прогноз баланса
        </h3>
        {data.forecast.available &&
        data.forecast.daysRemaining != null &&
        data.forecast.dailyBurnUsd != null ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-gray-500">Хватит при текущем темпе</p>
              <p
                className={`mt-1 text-2xl font-bold ${
                  data.forecast.urgency === "critical"
                    ? "text-red-400"
                    : data.forecast.urgency === "warning"
                      ? "text-amber-400"
                      : "text-green-400"
                }`}
              >
                {daysLabel(data.forecast.daysRemaining)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Суточный расход (база)</p>
              <p className="mt-1 text-lg font-semibold text-white">
                {usd(data.forecast.dailyBurnUsd)}
              </p>
              <p className="text-[10px] text-gray-500">{data.forecast.burnMethodLabel}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Оценка исчерпания</p>
              <p className="mt-1 text-lg font-semibold text-white">
                {data.forecast.depletionDate
                  ? new Date(`${data.forecast.depletionDate}T12:00:00Z`).toLocaleDateString(
                      "ru-RU",
                      { day: "numeric", month: "long", year: "numeric" }
                    )
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Прогноз трат</p>
              <p className="mt-1 text-sm text-gray-200">
                неделя ~{usd(data.forecast.projectedWeekSpend ?? 0)}
              </p>
              <p className="text-sm text-gray-400">
                месяц ~{usd(data.forecast.projectedMonthSpend ?? 0)}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-3 flex items-center gap-2 text-sm text-gray-400">
            <TrendingDown className="h-4 w-4 shrink-0" />
            {data.forecast.reason ?? "Недостаточно данных для прогноза"}
          </p>
        )}
        {data.forecast.balanceUsd != null ? (
          <p className="mt-3 text-[10px] text-gray-500">
            Остаток {usd(data.forecast.balanceUsd)} (
            {data.forecast.balanceSource === "account" ? "аккаунт" : "лимит ключа"}) ÷ суточный
            расход = горизонт. Если сегодня ещё мало трат, берётся среднее за прошлые дни.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-white">
            <Cpu className="h-4 w-4 text-gray-400" />
            Очередь LLM на сервере
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-gray-500">Активно</dt>
              <dd className="text-white">
                {data.llm.active} / {data.llm.max}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">В очереди</dt>
              <dd className="text-white">{data.llm.queued}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Фон (memory)</dt>
              <dd className="text-white">
                {data.llm.background.active} / {data.llm.background.max}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Таймаут очереди</dt>
              <dd className="text-white">{Math.round(data.llm.queueTimeoutMs / 1000)}с</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-white">
            <KeyRound className="h-4 w-4 text-gray-400" />
            Модели в настройках Zovus
          </h3>
          <ul className="mt-3 space-y-1.5 font-mono text-[11px] text-gray-400">
            {Object.entries(data.configuredModels).map(([k, v]) => (
              <li key={k} className="flex justify-between gap-2 border-b border-white/5 pb-1">
                <span className="text-gray-500">{k}</span>
                <span className="truncate text-right text-gray-300">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {data.activityNote && !data.activityAvailable ? (
        <p className="text-xs text-gray-500">{data.activityNote}</p>
      ) : null}

      {data.byModel.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-sm font-medium text-white">Расход по моделям (30 дней UTC)</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="pb-2 pr-3">Модель</th>
                  <th className="pb-2 pr-3">Провайдер</th>
                  <th className="pb-2 pr-3">Запросы</th>
                  <th className="pb-2 pr-3">USD</th>
                  <th className="pb-2 pr-3">Prompt</th>
                  <th className="pb-2 pr-3">Completion</th>
                  <th className="pb-2">Последний день</th>
                </tr>
              </thead>
              <tbody>
                {data.byModel.map((row) => (
                  <tr key={row.model} className="border-t border-white/5 text-gray-300">
                    <td className="py-2 pr-3 font-mono">{row.model}</td>
                    <td className="py-2 pr-3">{row.providerName || "—"}</td>
                    <td className="py-2 pr-3">{row.requests}</td>
                    <td className="py-2 pr-3 text-aura-gold">{usd(row.usageUsd)}</td>
                    <td className="py-2 pr-3">{row.promptTokens.toLocaleString("ru-RU")}</td>
                    <td className="py-2 pr-3">{row.completionTokens.toLocaleString("ru-RU")}</td>
                    <td className="py-2">{row.lastDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {data.dailySpend.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-sm font-medium text-white">По дням (UTC)</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[400px] text-left text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="pb-2 pr-3">Дата</th>
                  <th className="pb-2 pr-3">USD</th>
                  <th className="pb-2">Запросы</th>
                </tr>
              </thead>
              <tbody>
                {data.dailySpend.slice(0, 14).map((row) => (
                  <tr key={row.date} className="border-t border-white/5 text-gray-300">
                    <td className="py-2 pr-3">{row.date}</td>
                    <td className="py-2 pr-3 text-aura-gold">{usd(row.usageUsd)}</td>
                    <td className="py-2">{row.requests}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <p className="text-[10px] text-gray-600">
        Подробнее на{" "}
        <a
          href="https://openrouter.ai/activity"
          target="_blank"
          rel="noopener noreferrer"
          className="text-aura-gold hover:underline"
        >
          openrouter.ai/activity
        </a>
        .
      </p>
    </section>
  );
}
