"use client";

import { useEffect, useState } from "react";
import ProShell from "@/modules/pro/ui/ProShell";

export default function ProSettingsPage() {
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [timezone, setTimezone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/pro/account", { credentials: "include" });
        if (!res.ok) throw new Error("load_failed");
        const json = await res.json();
        const acc = json.account;
        if (acc) {
          setDisplayName(acc.display_name ?? "");
          setBio(acc.bio ?? "");
          setTimezone(acc.timezone ?? "");
        }
      } catch {
        setErr("Не удалось загрузить настройки. Обновите страницу.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/pro/account", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "onboarding",
          displayName: displayName.trim() || undefined,
          onboarding: {
            bio,
            timezone: timezone.trim() || undefined,
          },
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErr(
          typeof json.message === "string" ? json.message : "Не удалось сохранить"
        );
        return;
      }
      setMsg("Сохранено");
    } catch {
      setErr("Сеть недоступна. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProShell title="Настройки">
      {loading ? (
        <p className="text-sm text-gray-400">Загрузка…</p>
      ) : (
        <div className="flex max-w-md flex-col gap-3">
          <label className="text-sm text-gray-300">
            Отображаемое имя
            <input
              className="mt-1 w-full rounded border border-[#c9a24a]/30 bg-black/30 px-3 py-2"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
            />
          </label>
          <label className="text-sm text-gray-300">
            О себе
            <textarea
              className="mt-1 w-full rounded border border-[#c9a24a]/30 bg-black/30 px-3 py-2"
              rows={4}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={2000}
            />
          </label>
          <label className="text-sm text-gray-300">
            Часовой пояс (IANA)
            <input
              className="mt-1 w-full rounded border border-[#c9a24a]/30 bg-black/30 px-3 py-2"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Europe/Moscow"
              maxLength={64}
            />
          </label>
          <button
            type="button"
            className="btn-neon px-4 py-2 text-sm disabled:opacity-50"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
          {err ? (
            <p className="text-sm text-red-300" role="alert">
              {err}
            </p>
          ) : null}
          {msg ? <p className="text-sm text-[#e8c77e]">{msg}</p> : null}
        </div>
      )}
    </ProShell>
  );
}
