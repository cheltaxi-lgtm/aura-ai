"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Bot } from "lucide-react";
import AdminShell, {
  AdminTitle,
  AdminTable,
  AdminBtn,
  StatCard,
} from "@/components/admin/AdminShell";

type Tab = "overview" | "users" | "flags" | "events";

type FlagMap = Record<string, boolean>;

type AdminUser = {
  telegram_user_id: number;
  username: string | null;
  first_name: string | null;
  zovus_user_id: string | null;
  linked: boolean;
  age_confirmed: boolean;
  banned: boolean;
  blocked: boolean;
  streak_days: number;
  reminder_mode: string;
  utm_source: string | null;
  utm_campaign: string | null;
  last_active_at: string | null;
  created_at: string;
};

type AdminEvent = {
  id: number;
  name: string;
  telegram_user_id: number | null;
  payload: Record<string, unknown>;
  created_at: string;
};

type Dashboard = {
  ok: boolean;
  generatedAt?: string;
  day?: string;
  health?: { db: string; botEnabled: boolean; timezone: string };
  today?: Record<string, number>;
  totals?: Record<string, number>;
  funnel7d?: Record<string, number>;
  topEvents7d?: Array<{ name: string; count: number }>;
  eventsByDay?: Array<{ day: string; count: number }>;
  usersByDay?: Array<{ day: string; count: number }>;
  utmTop?: Array<{ source: string; count: number }>;
  campaignTop?: Array<{ campaign: string; count: number }>;
  reminderModes?: Array<{ mode: string; count: number }>;
  usage?: { llmToday: number; ttsToday: number };
  flags?: FlagMap;
  recentUsers?: AdminUser[];
  recentEvents?: AdminEvent[];
  site?: { linkedIdentities: number | null; linkedLast7d: number | null };
  error?: string;
  message?: string;
};

const FLAG_LABELS: Record<string, string> = {
  bot_enabled: "Бот включён",
  day_card_enabled: "Карта дня",
  reminders_enabled: "Напоминания",
  ritual_reveal_enabled: "Ритуал",
  tts_enabled: "Голос (TTS)",
  llm_enabled: "LLM тизеры",
  share_card_enabled: "Share-карточки",
  weekly_digest_enabled: "Недельный дайджест",
};

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "users", label: "Пользователи" },
  { id: "flags", label: "Флаги" },
  { id: "events", label: "События" },
];

function fmt(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return v.toLocaleString("ru-RU");
  return String(v);
}

function shortIso(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 16);
}

function MiniBars({
  items,
  maxBars = 30,
}: {
  items: Array<{ label: string; count: number }>;
  maxBars?: number;
}) {
  const slice = items.slice(-maxBars);
  const max = Math.max(1, ...slice.map((i) => i.count));
  return (
    <div className="flex h-28 items-end gap-0.5">
      {slice.map((i) => (
        <div
          key={i.label}
          className="group relative flex-1 rounded-t bg-aura-purple/50 hover:bg-aura-neon/70"
          style={{ height: `${Math.max(4, (i.count / max) * 100)}%` }}
          title={`${i.label}: ${i.count}`}
        />
      ))}
    </div>
  );
}

export default function AdminBotPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [userQ, setUserQ] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [usersLoading, setUsersLoading] = useState(false);

  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventName, setEventName] = useState("");
  const [eventsLoading, setEventsLoading] = useState(false);

  const [flags, setFlags] = useState<FlagMap>({});

  const loadDashboard = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/bot");
    const data = (await res.json()) as Dashboard;
    if (!res.ok) {
      setDash(data);
      setError(data.message || data.error || `Ошибка ${res.status}`);
      return;
    }
    setDash(data);
    if (data.flags) setFlags(data.flags);
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/admin/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "users",
          q: userQ,
          filter: userFilter,
          limit: 80,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setUsers(data.items ?? []);
        setUsersTotal(data.total ?? 0);
      } else {
        setError(data.message || data.error || "Не удалось загрузить пользователей");
      }
    } finally {
      setUsersLoading(false);
    }
  }, [userQ, userFilter]);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const res = await fetch("/api/admin/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "events",
          name: eventName || undefined,
          limit: 100,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setEvents(data.events ?? []);
      } else {
        setError(data.message || data.error || "Не удалось загрузить события");
      }
    } finally {
      setEventsLoading(false);
    }
  }, [eventName]);

  useEffect(() => {
    void loadDashboard().finally(() => setLoading(false));
  }, [loadDashboard]);

  useEffect(() => {
    if (tab === "users") void loadUsers();
    if (tab === "events") void loadEvents();
    if (tab === "flags" && dash?.flags) setFlags(dash.flags);
  }, [tab, loadUsers, loadEvents, dash?.flags]);

  const setFlag = async (key: string, enabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_flag", key, enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось изменить флаг");
        return;
      }
      if (data.flags) setFlags(data.flags);
      void loadDashboard();
    } finally {
      setBusy(false);
    }
  };

  const banToggle = async (telegramUserId: number, ban: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: ban ? "ban" : "unban",
          telegram_user_id: telegramUserId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось обновить бан");
        return;
      }
      void loadUsers();
      void loadDashboard();
    } finally {
      setBusy(false);
    }
  };

  const today = dash?.today ?? {};
  const totals = dash?.totals ?? {};
  const funnel = dash?.funnel7d ?? {};

  const eventBars = useMemo(
    () => (dash?.eventsByDay ?? []).map((d) => ({ label: d.day, count: d.count })),
    [dash?.eventsByDay]
  );
  const userBars = useMemo(
    () => (dash?.usersByDay ?? []).map((d) => ({ label: d.day, count: d.count })),
    [dash?.usersByDay]
  );

  return (
    <AdminShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <AdminTitle
          title="Telegram-бот"
          subtitle="Статистика, флаги, пользователи и события бота Zovus"
        />
        <AdminBtn
          onClick={() => {
            setBusy(true);
            void loadDashboard()
              .then(() => {
                if (tab === "users") return loadUsers();
                if (tab === "events") return loadEvents();
              })
              .finally(() => setBusy(false));
          }}
          disabled={busy || loading}
        >
          {busy || loading ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Обновление
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Обновить
            </span>
          )}
        </AdminBtn>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-xl px-4 py-2 text-sm transition-colors ${
              tab === t.id
                ? "bg-aura-purple/25 text-aura-neon"
                : "bg-white/5 text-gray-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !dash ? (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
      ) : (
        <>
          {tab === "overview" && (
            <div className="space-y-8">
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
                <Bot className="h-4 w-4 text-aura-neon" />
                <span>
                  День бота: <span className="text-white">{dash?.day ?? "—"}</span>
                </span>
                <span>·</span>
                <span>
                  TZ: <span className="text-white">{dash?.health?.timezone ?? "—"}</span>
                </span>
                <span>·</span>
                <span>
                  Статус:{" "}
                  <span
                    className={
                      dash?.health?.botEnabled ? "text-emerald-400" : "text-red-400"
                    }
                  >
                    {dash?.health?.botEnabled ? "включён" : "выключен"}
                  </span>
                </span>
                {dash?.generatedAt && (
                  <>
                    <span>·</span>
                    <span>обновлено {shortIso(dash.generatedAt)}</span>
                  </>
                )}
              </div>

              <section>
                <h2 className="mb-3 text-sm font-medium text-gray-400">Сегодня</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                  <StatCard label="Новые пользователи" value={fmt(today.users_new)} />
                  <StatCard label="Расклады / сессии" value={fmt(today.spreads)} />
                  <StatCard label="Тизеры" value={fmt(today.teaser_shown)} />
                  <StatCard label="CTA клики" value={fmt(today.cta_click)} accent="text-aura-neon" />
                  <StatCard label="Клеймы" value={fmt(today.receipt_claimed)} />
                  <StatCard label="Старт бота" value={fmt(today.bot_start)} />
                  <StatCard label="Age gate" value={fmt(today.age_gate_pass)} />
                  <StatCard label="Матрица full" value={fmt(today.matrix_full_ready)} />
                  <StatCard label="Каталог" value={fmt(today.catalog_opened)} />
                  <StatCard label="Доставка с сайта" value={fmt(today.site_reading_delivered)} />
                  <StatCard label="Голос ok/fail" value={`${fmt(today.voice_sent)} / ${fmt(today.voice_failed)}`} />
                  <StatCard label="Кризис" value={fmt(today.crisis_detected)} accent="text-amber-400" />
                  <StatCard label="LLM вызовы" value={fmt(dash?.usage?.llmToday)} />
                  <StatCard label="TTS вызовы" value={fmt(dash?.usage?.ttsToday)} />
                  <StatCard label="Напоминания" value={fmt(today.reminder_sent)} />
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-sm font-medium text-gray-400">База</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                  <StatCard label="Всего юзеров" value={fmt(totals.users)} />
                  <StatCard label="Active 7д" value={fmt(totals.active7d)} accent="text-aura-neon" />
                  <StatCard label="Active 30д" value={fmt(totals.active30d)} />
                  <StatCard label="Связаны с ЛК (бот)" value={fmt(totals.linked)} />
                  <StatCard
                    label="Связи в Postgres"
                    value={fmt(dash?.site?.linkedIdentities)}
                  />
                  <StatCard label="Связи 7д (сайт)" value={fmt(dash?.site?.linkedLast7d)} />
                  <StatCard label="Age confirmed" value={fmt(totals.ageConfirmed)} />
                  <StatCard label="Banned" value={fmt(totals.banned)} accent="text-red-400" />
                  <StatCard label="Blocked TG" value={fmt(totals.blocked)} />
                  <StatCard label="Unsubscribed" value={fmt(totals.unsubscribed)} />
                  <StatCard label="Guest sessions" value={fmt(totals.guestSessions)} />
                  <StatCard label="Claimed sessions" value={fmt(totals.guestClaimed)} />
                  <StatCard label="Open flows" value={fmt(totals.openFlows)} />
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-sm font-medium text-gray-400">Воронка 7 дней</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {Object.entries(funnel).map(([k, v]) => (
                    <StatCard key={k} label={k} value={fmt(v)} />
                  ))}
                </div>
              </section>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="glass-panel p-5">
                  <h3 className="mb-2 text-sm text-gray-400">События по дням (30д)</h3>
                  <MiniBars items={eventBars} />
                </div>
                <div className="glass-panel p-5">
                  <h3 className="mb-2 text-sm text-gray-400">Новые пользователи (30д)</h3>
                  <MiniBars items={userBars} />
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-sm text-gray-400">Топ событий 7д</h3>
                  <AdminTable
                    headers={["Событие", "Кол-во"]}
                    rows={(dash?.topEvents7d ?? []).map((e) => [e.name, fmt(e.count)])}
                  />
                </div>
                <div>
                  <h3 className="mb-3 text-sm text-gray-400">UTM source</h3>
                  <AdminTable
                    headers={["Source", "Юзеры"]}
                    rows={(dash?.utmTop ?? []).map((u) => [u.source, fmt(u.count)])}
                  />
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-sm text-gray-400">UTM campaign</h3>
                  <AdminTable
                    headers={["Campaign", "Юзеры"]}
                    rows={(dash?.campaignTop ?? []).map((u) => [u.campaign, fmt(u.count)])}
                  />
                </div>
                <div>
                  <h3 className="mb-3 text-sm text-gray-400">Режимы напоминаний</h3>
                  <AdminTable
                    headers={["Режим", "Юзеры"]}
                    rows={(dash?.reminderModes ?? []).map((r) => [r.mode, fmt(r.count)])}
                  />
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-sm text-gray-400">Недавние пользователи</h3>
                <AdminTable
                  headers={["TG", "Имя", "Linked", "Streak", "Активность"]}
                  rows={(dash?.recentUsers ?? []).map((u) => [
                    String(u.telegram_user_id),
                    u.username ? `@${u.username}` : u.first_name || "—",
                    u.linked ? "да" : "нет",
                    String(u.streak_days),
                    shortIso(u.last_active_at),
                  ])}
                />
              </div>
            </div>
          )}

          {tab === "users" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <input
                  value={userQ}
                  onChange={(e) => setUserQ(e.target.value)}
                  placeholder="Поиск: id / @username / имя"
                  className="min-w-[220px] flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-aura-purple/50"
                />
                <select
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                >
                  <option value="all">Все</option>
                  <option value="linked">Связанные</option>
                  <option value="active7d">Active 7д</option>
                  <option value="banned">Banned</option>
                  <option value="blocked">Blocked</option>
                </select>
                <AdminBtn onClick={() => void loadUsers()} disabled={usersLoading}>
                  {usersLoading ? "…" : "Найти"}
                </AdminBtn>
              </div>
              <p className="text-xs text-gray-500">Найдено: {usersTotal}</p>
              <AdminTable
                headers={[
                  "TG id",
                  "Имя",
                  "Статус",
                  "Streak",
                  "UTM",
                  "Активность",
                  "Действие",
                ]}
                rows={users.map((u) => [
                  String(u.telegram_user_id),
                  u.username ? `@${u.username}` : u.first_name || "—",
                  [
                    u.banned ? "ban" : null,
                    u.blocked ? "blocked" : null,
                    u.linked ? "linked" : null,
                    u.age_confirmed ? "18+" : null,
                  ]
                    .filter(Boolean)
                    .join(", ") || "ok",
                  String(u.streak_days),
                  [u.utm_source, u.utm_campaign].filter(Boolean).join(" / ") || "—",
                  shortIso(u.last_active_at),
                  <AdminBtn
                    key="ban"
                    variant={u.banned ? "default" : "danger"}
                    disabled={busy}
                    onClick={() => void banToggle(u.telegram_user_id, !u.banned)}
                  >
                    {u.banned ? "Разбан" : "Бан"}
                  </AdminBtn>,
                ])}
              />
            </div>
          )}

          {tab === "flags" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                Флаги хранятся в SQLite бота и применяются сразу (без рестарта).
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {Object.keys(FLAG_LABELS).map((key) => {
                  const on = Boolean(flags[key]);
                  return (
                    <div
                      key={key}
                      className="glass-panel flex items-center justify-between gap-4 p-4"
                    >
                      <div>
                        <p className="text-sm text-white">{FLAG_LABELS[key] || key}</p>
                        <p className="text-xs text-gray-500">{key}</p>
                      </div>
                      <AdminBtn
                        variant={on ? "danger" : "default"}
                        disabled={busy}
                        onClick={() => void setFlag(key, !on)}
                      >
                        {on ? "Выкл" : "Вкл"}
                      </AdminBtn>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "events" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <input
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="Фильтр по имени события (например teaser_shown)"
                  className="min-w-[260px] flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-aura-purple/50"
                />
                <AdminBtn onClick={() => void loadEvents()} disabled={eventsLoading}>
                  {eventsLoading ? "…" : "Загрузить"}
                </AdminBtn>
              </div>
              <AdminTable
                headers={["Время", "Событие", "TG", "Payload"]}
                rows={events.map((e) => [
                  shortIso(e.created_at),
                  e.name,
                  e.telegram_user_id != null ? String(e.telegram_user_id) : "—",
                  <span
                    key={e.id}
                    className="block max-w-md truncate font-mono text-[11px] text-gray-500"
                    title={JSON.stringify(e.payload)}
                  >
                    {JSON.stringify(e.payload)}
                  </span>,
                ])}
              />
            </div>
          )}
        </>
      )}
    </AdminShell>
  );
}
