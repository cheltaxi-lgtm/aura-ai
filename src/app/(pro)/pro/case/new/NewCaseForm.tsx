"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProShell from "@/modules/pro/ui/ProShell";

type Client = { id: string; alias: string };

export default function NewCaseForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState(sp.get("clientId") || "");
  const [type, setType] = useState("manual_spread");
  const [question, setQuestion] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/pro/clients", { credentials: "include" });
      const json = await res.json();
      if (res.ok) setClients(json.clients || []);
    })();
  }, []);

  async function create() {
    setErr(null);
    const res = await fetch("/api/pro/cases", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, type, question }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error || "Ошибка");
      return;
    }
    router.push(`/pro/case/${json.case.id}`);
  }

  return (
    <ProShell title="Новый кейс">
      <div className="flex max-w-md flex-col gap-3">
        <label className="text-sm text-gray-300">
          Клиент
          <select
            className="mt-1 w-full rounded border border-[#c9a24a]/30 bg-black/30 px-3 py-2"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">Выберите…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.alias}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-300">
          Тип
          <select
            className="mt-1 w-full rounded border border-[#c9a24a]/30 bg-black/30 px-3 py-2"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="manual_spread">Ручной расклад</option>
            <option value="natal">Натал</option>
            <option value="matrix">Матрица</option>
          </select>
        </label>
        <label className="text-sm text-gray-300">
          Вопрос
          <textarea
            className="mt-1 w-full rounded border border-[#c9a24a]/30 bg-black/30 px-3 py-2"
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </label>
        {err && <p className="text-sm text-red-300">{err}</p>}
        <button
          type="button"
          className="btn-neon px-4 py-2 text-sm"
          disabled={!clientId}
          onClick={() => void create()}
        >
          Создать
        </button>
      </div>
    </ProShell>
  );
}
