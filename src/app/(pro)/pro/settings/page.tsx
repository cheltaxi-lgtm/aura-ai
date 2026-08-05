"use client";

import { useState } from "react";
import ProShell from "@/modules/pro/ui/ProShell";

export default function ProSettingsPage() {
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    const res = await fetch("/api/pro/account", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "onboarding",
        displayName,
        onboarding: { bio, addressForm: "vy", specializations: ["tarot"] },
      }),
    });
    setMsg(res.ok ? "Сохранено" : "Ошибка");
  }

  return (
    <ProShell title="Настройки">
      <div className="flex max-w-md flex-col gap-3">
        <label className="text-sm text-gray-300">
          Отображаемое имя
          <input
            className="mt-1 w-full rounded border border-[#c9a24a]/30 bg-black/30 px-3 py-2"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label className="text-sm text-gray-300">
          О себе
          <textarea
            className="mt-1 w-full rounded border border-[#c9a24a]/30 bg-black/30 px-3 py-2"
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </label>
        <button type="button" className="btn-neon px-4 py-2 text-sm" onClick={() => void save()}>
          Сохранить
        </button>
        {msg && <p className="text-sm text-[#e8c77e]">{msg}</p>}
      </div>
    </ProShell>
  );
}
