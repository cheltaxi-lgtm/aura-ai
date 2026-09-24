"use client";

import { useEffect, useRef, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, AdminBtn } from "@/components/admin/AdminShell";
import { TRIPLET_COOLDOWN_MS, formatTripletCooldownRu } from "@/lib/triplet-limit";

const GRANT_PRESETS = [50, 100, 250, 500, 1000];

function tripletCooldownLabel(lastDrawAt: string | null | undefined): string {
  if (!lastDrawAt) return "доступен";
  const next = new Date(new Date(lastDrawAt).getTime() + TRIPLET_COOLDOWN_MS);
  if (Date.now() >= next.getTime()) return "доступен";
  return formatTripletCooldownRu(next.toISOString());
}

function formatRunes(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0 ᚢ";
  return `${n.toLocaleString("ru-RU")} ᚢ`;
}

function formatDateTime(value: unknown): string {
  if (value == null || value === "") return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const OAUTH_PROVIDER_LABELS: Record<string, string> = {
  yandex: "Яндекс",
  vk: "ВКонтакте",
  mailru: "Mail.ru",
};

function accountAuthLabel(oauthProvider: string | null, hasPassword: boolean): string {
  if (oauthProvider) return OAUTH_PROVIDER_LABELS[oauthProvider] ?? oauthProvider;
  if (hasPassword) return "Email";
  return "—";
}

function AccountStatusBadge({
  profileUserId,
  oauthProvider,
  hasPassword,
  erasureRequestedAt,
}: {
  profileUserId: string | null;
  oauthProvider: string | null;
  hasPassword: boolean;
  erasureRequestedAt: string | null;
}) {
  const awaitingOnboarding = !profileUserId;
  return (
    <div className="flex flex-col gap-1">
      <span
        className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-medium ${
          erasureRequestedAt
            ? "bg-red-500/20 text-red-300"
            : awaitingOnboarding
            ? "bg-amber-500/20 text-amber-300"
            : "bg-emerald-500/20 text-emerald-300"
        }`}
      >
        {erasureRequestedAt ? "Удаление выполняется" : awaitingOnboarding ? "Ожидает onboarding" : "Активен"}
      </span>
      <span className="text-[11px] text-gray-500">
        Вход: {accountAuthLabel(oauthProvider, hasPassword)}
      </span>
    </div>
  );
}

export default function AdminUsersPage() {
  const grantOperation = useRef<{payload:string;id:string}|null>(null);
  const grantInFlight = useRef(false);
  const [tab, setTab] = useState<"accounts" | "profiles">("accounts");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [tripletBusyId, setTripletBusyId] = useState<string | null>(null);
  const [grantModal, setGrantModal] = useState<{
    profileUserId: string;
    label: string;
    currentBalance: number;
  } | null>(null);
  const [grantAmount, setGrantAmount] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantNotice, setGrantNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [memoryPurgeBusyId, setMemoryPurgeBusyId] = useState<string | null>(null);

  const load = () => {
    fetch(`/api/admin/users?type=${tab}`)
      .then((r) => { if (!r.ok) throw new Error("load_failed"); return r.json(); })
      .then((d) => { setItems(d.items ?? []); setGrantNotice((current) => current?.error ? null : current); })
      .catch(() => setGrantNotice({ text: "Не удалось обновить список пользователей. Повторите загрузку страницы.", error: true }));
  };

  useEffect(load, [tab]);

  const openGrantModal = (profileUserId: string, label: string, currentBalance: number) => {
    setGrantNotice(null);
    setGrantAmount("");
    setGrantReason("");
    setGrantModal({ profileUserId, label, currentBalance });
  };

  const deleteUser = async (id: string, email: string) => {
    if (!confirm(`Удалить аккаунт ${email} и данные Telegram-бота? Это может занять несколько минут.`)) return;
    setDeleteBusyId(id);
    try {
      const { adminFetch } = await import("@/lib/admin-fetch");
      const response = await adminFetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data.error ?? "Не удалось запустить удаление");
        return;
      }
      setGrantNotice({ text: "Удаление принято: аккаунт и данные бота будут очищены вместе.", error: false });
      setItems((current) => current.map((item) => String(item.id) === id
        ? { ...item, erasure_requested_at: new Date().toISOString() } : item));
      load();
    } catch {
      setGrantNotice({ text: "Не удалось запросить удаление. Проверьте состояние аккаунта и повторите попытку.", error: true });
    } finally {
      setDeleteBusyId(null);
    }
  };

  const toggleUnlimited = async (id: string, next: boolean) => {
    setBusyId(id);
    try {
      const { adminFetch } = await import("@/lib/admin-fetch");
      await adminFetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isUnlimited: next }),
      });
      load();
    } finally {
      setBusyId(null);
    }
  };

  const toggleInternal = async (id: string, next: boolean) => {
    setBusyId(id);
    try {
      const { adminFetch } = await import("@/lib/admin-fetch");
      await adminFetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isInternal: next }),
      });
      load();
    } finally {
      setBusyId(null);
    }
  };

  const resetTripletCooldown = async (profileUserId: string, email: string) => {
    if (
      !confirm(
        `Сбросить дневные расклады для ${email}?\n\nБудут сняты лимиты «3 карты» и «Энергия дня», удалены сохранённые расклады на сегодня. Пользователь сможет начать заново после обновления страницы.`
      )
    ) {
      return;
    }
    setTripletBusyId(profileUserId);
    try {
      const { adminFetch } = await import("@/lib/admin-fetch");
      const res = await adminFetch(`/api/admin/users/${profileUserId}/triplet-cooldown`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const parts = [
          `triplet: ${Number(data.deletedHistory ?? 0)}`,
          `энергия дня: ${Number(data.deletedDailyReadings ?? 0)}`,
        ];
        setGrantNotice({ text: `Сброс для ${email}: удалено ${parts.join(", ")}.`, error: false });
        load();
      } else {
        alert(data.error ?? "Ошибка сброса");
      }
    } finally {
      setTripletBusyId(null);
    }
  };

  const purgeUserMemory = async (profileUserId: string, email: string) => {
    if (
      !confirm(
        `Очистить всю AI-память для ${email}?\n\nБудут удалены сохранённые факты и эпизоды сеансов. Содержимое не показывается — только сброс. История чатов и кабинета не затрагивается.`
      )
    ) {
      return;
    }
    setMemoryPurgeBusyId(profileUserId);
    try {
      const { adminFetch } = await import("@/lib/admin-fetch");
      const res = await adminFetch(`/api/admin/users/${profileUserId}/memory`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setGrantNotice({ text:
          `Память очищена для ${email}: удалено ${Number(data.deleted ?? 0).toLocaleString("ru-RU")} записей.`, error: false
        });
      } else {
        alert(data.error ?? "Ошибка очистки памяти");
      }
    } finally {
      setMemoryPurgeBusyId(null);
    }
  };

  const submitGrant = async () => {
    if (!grantModal || grantInFlight.current) return;
    const amount = Number(grantAmount);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      alert("Укажите положительное количество рун");
      return;
    }
    if (!grantReason.trim()) {
      alert("Укажите причину начисления");
      return;
    }

    const payload = JSON.stringify([grantModal.profileUserId, amount, grantReason.trim()]);
    if (grantOperation.current?.payload !== payload) grantOperation.current = {payload,id:crypto.randomUUID()};
    grantInFlight.current = true;
    setGrantBusy(true);
    try {
      const { adminFetch } = await import("@/lib/admin-fetch");
      const res = await adminFetch(`/api/admin/users/${grantModal.profileUserId}/runes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, reason: grantReason.trim(), operationId: grantOperation.current.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        grantOperation.current = null;
        setGrantModal(null);
        setGrantAmount("");
        setGrantReason("");
        setGrantNotice({ text:
          `Начислено ${amount.toLocaleString("ru-RU")} ᚢ. Новый баланс: ${formatRunes(data.newBalance)}`, error: false
        });
        load();
      } else {
        alert(data.error ?? "Ошибка начисления");
      }
    } finally {
      grantInFlight.current = false;
      setGrantBusy(false);
    }
  };

  const renderRunesCell = (
    profileUserId: string | null | undefined,
    label: string,
    balance: unknown
  ) => {
    if (!profileUserId) return "—";
    const currentBalance = Number(balance) || 0;
    return (
      <div key="runes" className="flex flex-col gap-1">
        <span className="text-sm font-medium text-aura-champagne">{formatRunes(currentBalance)}</span>
        <AdminBtn onClick={() => openGrantModal(profileUserId, label, currentBalance)}>
          Начислить
        </AdminBtn>
      </div>
    );
  };

  return (
    <AdminShell>
      <AdminTitle
        title="Пользователи"
        subtitle="Аккаунты, профили и ручное начисление рун"
      />
      {grantNotice && (
        <div role={grantNotice.error ? "alert" : "status"} aria-live="polite" className={`mb-4 rounded-xl border px-4 py-3 text-sm ${grantNotice.error ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-aura-emerald/30 bg-aura-emerald/10 text-aura-emerald"}`}>
          {grantNotice.text}
        </div>
      )}
      <div className="mb-4 flex gap-2">
        {(["accounts", "profiles"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm ${tab === t ? "bg-aura-gold/20 text-aura-champagne" : "text-gray-500 hover:text-white"}`}
          >
            {t === "accounts" ? "Аккаунты" : "Профили"}
          </button>
        ))}
      </div>

      {tab === "accounts" ? (
        <AdminTable
          headers={["Email", "Имя", "Статус", "Профиль", "Знак", "Сессий", "3 карты", "Безлимит", "Внутренний", "Руны", "Создан", "Последняя активность", ""]}
          rows={items.map((u) => {
            const id = String(u.id);
            const profileUserId = u.profile_user_id ? String(u.profile_user_id) : null;
            const unlimited = Boolean(u.is_unlimited);
            const internal = Boolean(u.is_internal);
            const lastTriplet = u.last_triplet_draw_at ? String(u.last_triplet_draw_at) : null;
            const tripletStatus = tripletCooldownLabel(lastTriplet);
            const email = String(u.email);
            const oauthProvider = u.oauth_provider ? String(u.oauth_provider) : null;
            const hasPassword = Boolean(u.has_password);
            const erasureRequestedAt = u.erasure_requested_at ? String(u.erasure_requested_at) : null;
            return [
              email,
              String(u.name),
              <AccountStatusBadge
                key="status"
                profileUserId={profileUserId}
                oauthProvider={oauthProvider}
                hasPassword={hasPassword}
                erasureRequestedAt={erasureRequestedAt}
              />,
              profileUserId ? String(u.profile_name ?? "—") : <span className="text-gray-500">не создан</span>,
              String(u.zodiac ?? "—"),
              String(u.sessions_count ?? "0"),
              profileUserId ? (
                <div key="t" className="flex flex-col gap-1">
                  <span
                    className={`text-xs ${tripletStatus === "доступен" ? "text-aura-emerald" : "text-amber-400/90"}`}
                  >
                    {tripletStatus}
                  </span>
                  <button
                    type="button"
                    disabled={Boolean(erasureRequestedAt) || tripletBusyId === profileUserId}
                    onClick={() => void resetTripletCooldown(profileUserId, email)}
                    className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-400 transition-colors hover:border-aura-gold/40 hover:text-white disabled:opacity-50"
                  >
                    {tripletBusyId === profileUserId ? "…" : "Сбросить"}
                  </button>
                </div>
              ) : (
                "—"
              ),
              <button
                key="u"
                type="button"
                disabled={Boolean(erasureRequestedAt) || busyId === id}
                onClick={() => void toggleUnlimited(id, !unlimited)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  unlimited
                    ? "bg-aura-emerald/20 text-aura-emerald hover:bg-aura-emerald/30"
                    : "border border-white/10 text-gray-400 hover:border-aura-gold/40 hover:text-white"
                } disabled:opacity-50`}
              >
                {busyId === id ? "…" : unlimited ? "∞ Вкл" : "Выкл"}
              </button>,
              <button
                key="i"
                type="button"
                disabled={Boolean(erasureRequestedAt) || busyId === id}
                onClick={() => void toggleInternal(id, !internal)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${internal ? "bg-sky-400/20 text-sky-300" : "border border-white/10 text-gray-400"} disabled:opacity-50`}
              >
                {internal ? "Скрыт" : "Клиент"}
              </button>,
              erasureRequestedAt ? "—" : renderRunesCell(profileUserId, email, u.rune_balance),
              new Date(String(u.created_at)).toLocaleDateString("ru-RU"),
              formatDateTime(u.last_activity_at),
              <div key="actions" className="flex gap-1.5">
                {profileUserId && (
                  <AdminBtn
                    variant="danger"
                    disabled={Boolean(erasureRequestedAt) || memoryPurgeBusyId === profileUserId}
                    onClick={() => void purgeUserMemory(profileUserId, email)}
                  >
                    {memoryPurgeBusyId === profileUserId ? "…" : "Очистить память"}
                  </AdminBtn>
                )}
                <AdminBtn variant="danger" disabled={Boolean(erasureRequestedAt) || deleteBusyId === id} onClick={() => void deleteUser(id, email)}>
                  {erasureRequestedAt ? "Удаляется" : deleteBusyId === id ? "Запрос…" : "Удалить"}
                </AdminBtn>
              </div>,
            ];
          })}
        />
      ) : (
        <AdminTable
          headers={["Имя", "Email", "Пол", "ДР", "Знак", "Руны", "Создан", "Последняя активность"]}
          rows={items.map((u) => {
            const profileUserId = String(u.id);
            const label = u.account_email ? String(u.account_email) : String(u.name);
            return [
              String(u.name),
              String(u.account_email ?? "—"),
              u.gender === "male" ? "М" : u.gender === "female" ? "Ж" : "—",
              String(u.birth_date),
              String(u.zodiac),
              u.erasure_requested_at ? "—" : renderRunesCell(profileUserId, label, u.rune_balance),
              new Date(String(u.created_at)).toLocaleDateString("ru-RU"),
              formatDateTime(u.last_activity_at),
            ];
          })}
        />
      )}

      {grantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1028] p-6">
            <h3 className="text-lg font-semibold text-white">Начислить руны</h3>
            <p className="mt-1 text-sm text-white/50">{grantModal.label}</p>
            <p className="mt-2 text-sm text-white/70">
              Текущий баланс:{" "}
              <span className="font-medium text-aura-champagne">
                {formatRunes(grantModal.currentBalance)}
              </span>
            </p>
            <label className="mt-4 block text-sm text-white/70">
              Количество ᚢ
              <input
                type="number"
                min={1}
                value={grantAmount}
                onChange={(e) => setGrantAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {GRANT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setGrantAmount(String(preset))}
                  className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-gray-400 transition-colors hover:border-aura-gold/40 hover:text-white"
                >
                  +{preset}
                </button>
              ))}
            </div>
            <label className="mt-3 block text-sm text-white/70">
              Причина (попадёт в аудит)
              <input
                type="text"
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                placeholder="Компенсация / тест / промо"
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <AdminBtn onClick={() => setGrantModal(null)}>Отмена</AdminBtn>
              <AdminBtn onClick={() => void submitGrant()} disabled={grantBusy}>
                {grantBusy ? "…" : "Начислить"}
              </AdminBtn>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
