"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ProShell from "@/modules/pro/ui/ProShell";

type Block = { id: string; title: string; body: string };

export default function ProCasePage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [cards, setCards] = useState("Шут, Маг, Жрица");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [deliverUrl, setDeliverUrl] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/pro/cases/${params.id}`, { credentials: "include" });
    const json = await res.json();
    if (res.ok) {
      setData(json);
      const latest = [...(json.versions || [])].reverse()[0];
      if (latest?.blocks) setBlocks(latest.blocks);
    }
  }

  useEffect(() => {
    void load();
  }, [params.id]);

  async function patch(action: string, body: Record<string, unknown> = {}) {
    setMsg(null);
    const res = await fetch(`/api/pro/cases/${params.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMsg(json.error || json.message || "Ошибка");
      return json;
    }
    if (json.version?.blocks) setBlocks(json.version.blocks);
    if (json.url) setDeliverUrl(json.url);
    if (json.token) setDeliverUrl(`/r/${json.token}`);
    await load();
    setMsg("Сохранено");
    return json;
  }

  if (!data) {
    return (
      <ProShell title="Кейс">
        <p className="text-sm text-gray-400">Загрузка…</p>
      </ProShell>
    );
  }

  const c = data.case;

  return (
    <ProShell title={`Кейс · ${c.type}`}>
      <p className="text-sm text-gray-400">
        Статус: {c.status} · клиент: {data.client?.alias}
      </p>
      <p className="mt-2 text-sm text-[#ede6da]">{c.question}</p>

      {c.type === "manual_spread" && (
        <div className="mt-6">
          <label className="text-sm text-gray-300">
            Карты через запятую
            <input
              className="mt-1 w-full rounded border border-[#c9a24a]/30 bg-black/30 px-3 py-2"
              value={cards}
              onChange={(e) => setCards(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn-neon mt-2 px-4 py-2 text-sm"
            onClick={() =>
              void patch("input", {
                payload: {
                  cards: cards.split(",").map((name, i) => ({
                    name: name.trim(),
                    position: `Позиция ${i + 1}`,
                  })),
                },
              })
            }
          >
            Сохранить ввод
          </button>
        </div>
      )}

      {(c.type === "natal" || c.type === "matrix") && (
        <div className="mt-6">
          <button
            type="button"
            className="btn-neon px-4 py-2 text-sm"
            onClick={() =>
              void patch("input", {
                payload: {
                  birthDate: data.client?.birth_date || "1990-01-01",
                  birthPlace: data.client?.birth_place || "Москва",
                  birthLat: data.client?.birth_lat,
                  birthLon: data.client?.birth_lon,
                  birthTz: data.client?.birth_tz || "Europe/Moscow",
                },
              })
            }
          >
            Подтянуть данные рождения клиента
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-neon px-4 py-2 text-sm"
          onClick={() => void patch("generate", { idempotencyKey: `ui-${params.id}-gen` })}
        >
          Сгенерировать черновик
        </button>
        <button
          type="button"
          className="btn-neon px-4 py-2 text-sm"
          onClick={() => void patch("save_human", { blocks })}
        >
          Сохранить как human-версию
        </button>
        <button
          type="button"
          className="rounded border border-[#c9a24a]/40 px-4 py-2 text-sm text-[#e8c77e]"
          onClick={() => void patch("deliver", { ttl: "30", dialogMode: "b" })}
        >
          Выдать клиенту
        </button>
      </div>

      {msg && <p className="mt-3 text-sm text-[#e8c77e]">{msg}</p>}
      {deliverUrl && (
        <p className="mt-2 text-sm text-gray-300">
          Ссылка: <code className="text-[#e8c77e]">{deliverUrl}</code>
        </p>
      )}

      <div className="mt-8 space-y-4">
        {blocks.map((b, idx) => (
          <div key={b.id} className="rounded border border-[#c9a24a]/20 p-4">
            <input
              className="mb-2 w-full bg-transparent font-display text-lg text-[#e8c77e]"
              value={b.title}
              onChange={(e) => {
                const next = [...blocks];
                next[idx] = { ...b, title: e.target.value };
                setBlocks(next);
              }}
            />
            <textarea
              className="w-full rounded bg-black/20 p-2 text-sm text-gray-200"
              rows={5}
              value={b.body}
              onChange={(e) => {
                const next = [...blocks];
                next[idx] = { ...b, body: e.target.value };
                setBlocks(next);
              }}
            />
          </div>
        ))}
      </div>
    </ProShell>
  );
}
