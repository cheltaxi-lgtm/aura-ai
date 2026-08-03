"use client";

import { useEffect, useState } from "react";
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
}: {
  profileUserId: string | null;
  oauthProvider: string | null;
  hasPassword: boolean;
}) {
  const awaitingOnboarding = !profileUserId;
  return (
    <div className="flex flex-col gap-1">
      <span
        className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-medium ${
          awaitingOnboarding
            ? "bg-amber-500/20 text-amber-300"
            : "bg-emerald-500/20 text-emerald-300"
        }`}
      >
        {awaitingOnboarding ? "Ожидает onboarding" : "Активен"}
      </span>
      <span className="text-[11px] text-gray-500">
        Вход: {accountAuthLabel(oauthProvider, hasPassword)}
      </span>
    </div>
  );
}

export default function AdminUsersPage() {
  const [tab, setTab] = useState<"accounts" | "profiles">("accounts");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tripletBusyId, setTripletBusyId] = useState<string | null>(null);
  const [grantModal, setGrantModal] = useState<{
    profileUserId: string;
    label: string;
    currentBalance: number;
  } | null>(null);
  const [grantAmount, setGrantAmount] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantNotice, setGrantNotice] = useState<string | null>(null);
  const [memoryPurgeBusyId, setMemoryPurgeBusyId] = useState<string | null>(null);

  const load = () => {
    fetch(`/api/admin/users?type=${tab}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []));
  };

  useEffect(load, [tab]);

  const openGrantModal = (profileUserId: string, label: string, currentBalance: number) => {
    setGrantNotice(null);
    setGrantAmount("");
    setGrantReason("");
    setGrantModal({ profileUserId, label, currentBalance });
  };

  const deleteUser = async (id: string) => {
    if (!confirm("Удалить аккаунт?")) return;
    const { adminFetch } = await import("@/lib/admin-fetch");
    await adminFetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
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
        setGrantNotice(`Сброс для ${email}: удалено ${parts.join(", ")}.`);
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
        setGrantNotice(
          `Память очищена для ${email}: удалено ${Number(data.deleted ?? 0).toLocaleString("ru-RU")} записей.`
        );
      } else {
        alert(data.error ?? "Ошибка очистки памяти");
      }
    } finally {
      setMemoryPurgeBusyId(null);
    }
  };

  const submitGrant = async () => {
    if (!grantModal) return;
    const amount = Math.round(Number(grantAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Укажите положительное количество рун");
      return;
    }
    if (!grantReason.trim()) {
      alert("Укажите причину начисления");
      return;
    }

    setGrantBusy(true);
    try {
      const { adminFetch } = await import("@/lib/admin-fetch");
      const res = await adminFetch(`/api/admin/users/${grantModal.profileUserId}/runes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, reason: grantReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setGrantModal(null);
        setGrantAmount("");
        setGrantReason("");
        setGrantNotice(
          `Начислено ${amount.toLocaleString("ru-RU")} ᚢ. Новый баланс: ${formatRunes(data.newBalance)}`
        );
        load();
      } else {
        alert(data.error ?? "Ошибка начисления");
      }
    } finally {
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
        <span className="text-sm font-medium text-aura-neon">{formatRunes(currentBalance)}</span>
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
        <div className="mb-4 rounded-xl border border-aura-emerald/30 bg-aura-emerald/10 px-4 py-3 text-sm text-aura-emerald">
          {grantNotice}
        </div>
      )}
      <div className="mb-4 flex gap-2">
        {(["accounts", "profiles"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm ${tab === t ? "bg-aura-purple/20 text-aura-neon" : "text-gray-500 hover:text-white"}`}
          >
            {t === "accounts" ? "Аккаунты" : "Профили"}
          </button>
        ))}
      </div>

      {tab === "accounts" ? (
        <AdminTable
          headers={["Email", "Имя", "Статус", "Профиль", "Знак", "Сессий", "3 карты", "Безлимит", "Руны", "Создан", ""]}
          rows={items.map((u) => {
            const id = String(u.id);
            const profileUserId = u.profile_user_id ? String(u.profile_user_id) : null;
            const unlimited = Boolean(u.is_unlimited);
            const lastTriplet = u.last_triplet_draw_at ? String(u.last_triplet_draw_at) : null;
            const tripletStatus = tripletCooldownLabel(lastTriplet);
            const email = String(u.email);
            const oauthProvider = u.oauth_provider ? String(u.oauth_provider) : null;
            const hasPassword = Boolean(u.has_password);
            return [
              email,
              String(u.name),
              <AccountStatusBadge
                key="status"
                profileUserId={profileUserId}
                oauthProvider={oauthProvider}
                hasPassword={hasPassword}
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
                    disabled={tripletBusyId === profileUserId}
                    onClick={() => void resetTripletCooldown(profileUserId, email)}
                    className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-400 transition-colors hover:border-aura-purple/40 hover:text-white disabled:opacity-50"
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
                disabled={busyId === id}
                onClick={() => void toggleUnlimited(id, !unlimited)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  unlimited
                    ? "bg-aura-emerald/20 text-aura-emerald hover:bg-aura-emerald/30"
                    : "border border-white/10 text-gray-400 hover:border-aura-purple/40 hover:text-white"
                } disabled:opacity-50`}
              >
                {busyId === id ? "…" : unlimited ? "∞ Вкл" : "Выкл"}
              </button>,
              renderRunesCell(profileUserId, email, u.rune_balance),
              new Date(String(u.created_at)).toLocaleDateString("ru-RU"),
              <div key="actions" className="flex gap-1.5">
                {profileUserId && (
                  <AdminBtn
                    variant="danger"
                    disabled={memoryPurgeBusyId === profileUserId}
                    onClick={() => void purgeUserMemory(profileUserId, email)}
                  >
                    {memoryPurgeBusyId === profileUserId ? "…" : "Очистить память"}
                  </AdminBtn>
                )}
                <AdminBtn variant="danger" onClick={() => deleteUser(id)}>
                  Удалить
                </AdminBtn>
              </div>,
            ];
          })}
        />
      ) : (
        <AdminTable
          headers={["Имя", "Email", "Пол", "ДР", "Знак", "Руны", "Создан"]}
          rows={items.map((u) => {
            const profileUserId = String(u.id);
            const label = u.account_email ? String(u.account_email) : String(u.name);
            return [
              String(u.name),
              String(u.account_email ?? "—"),
              u.gender === "male" ? "М" : u.gender === "female" ? "Ж" : "—",
              String(u.birth_date),
              String(u.zodiac),
              renderRunesCell(profileUserId, label, u.rune_balance),
              new Date(String(u.created_at)).toLocaleDateString("ru-RU"),
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
              <span className="font-medium text-aura-neon">
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
                  className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-gray-400 transition-colors hover:border-aura-purple/40 hover:text-white"
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
