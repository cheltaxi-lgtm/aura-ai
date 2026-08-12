"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatProDateOnly } from "@/modules/pro/adapters/date-only";
import ProShell from "@/modules/pro/ui/ProShell";

const ERROR_RU: Record<string, string> = {
  pro_case_daily_limit: "Дневной лимит кейсов исчерпан — продолжите завтра",
  client_not_found: "Клиент не найден — обновите страницу",
  unsupported_case_type: "Этот тип практики пока недоступен",
  pro_trial_exceeded: "Пробный период исчерпан — см. страницу «Биллинг»",
};

type Client = {
  id: string;
  alias: string;
  birth_date?: string | null;
  birth_place?: string | null;
};

const PRACTICES = [
  {
    value: "natal",
    label: "Натальная карта",
    hint: "Дата, время, город — колесо + премиум-разбор",
  },
  {
    value: "matrix",
    label: "Матрица судьбы",
    hint: "Дата рождения — диаграмма + разбор зон",
  },
  {
    value: "hd",
    label: "Human Design",
    hint: "Дата, время, часовой пояс — бодиграф + расшифровка",
  },
  {
    value: "manual_spread",
    label: "Ручной расклад",
    hint: "Карты вручную (без премиум-графики)",
  },
] as const;

export default function NewCaseForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState(sp.get("clientId") || "");
  const [type, setType] = useState<string>(sp.get("type") || "natal");
  const [question, setQuestion] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clientsLoaded, setClientsLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/pro/clients", { credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (res.ok) setClients(json.clients || []);
        else setErr("Не удалось загрузить список клиентов");
      } catch {
        setErr("Сеть недоступна. Обновите страницу.");
      } finally {
        setClientsLoaded(true);
      }
    })();
  }, []);

  const selected = clients.find((c) => c.id === clientId);

  async function create() {
    setErr(null);
    setBusy(true);
    const res = await fetch("/api/pro/cases", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, type, question }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      const code = typeof json.error === "string" ? json.error : "";
      setErr(
        typeof json.message === "string"
          ? json.message
          : ERROR_RU[code] ?? "Не удалось создать кейс. Попробуйте ещё раз."
      );
      return;
    }
    router.push(`/pro/case/${json.case.id}`);
  }

  return (
    <ProShell title="Новая практика">
      <p className="mb-4 max-w-lg text-sm text-gray-400">
        Выберите практику сайта — данные рождения подтянутся из карточки
        клиента, если они сохранены.
      </p>
      <div className="flex max-w-lg flex-col gap-4">
        {clientsLoaded && clients.length === 0 ? (
          <div className="pro-panel text-sm text-[var(--pro-muted)]">
            <p>Сначала добавьте клиента — кейс всегда привязан к карточке.</p>
            <Link href="/pro/clients" className="btn-neon mt-3 inline-block px-4 py-2 text-xs">
              Добавить клиента
            </Link>
          </div>
        ) : null}
        <label className="text-sm text-gray-300">
          Клиент
          <select
            className="mt-1 w-full rounded border border-[#c9a24a]/30 bg-black/30 px-3 py-2"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">Выберите…</option>
            {clients.map((c) => {
              const bd = formatProDateOnly(c.birth_date);
              return (
                <option key={c.id} value={c.id}>
                  {c.alias}
                  {bd ? ` · ${bd}` : ""}
                </option>
              );
            })}
          </select>
        </label>
        {selected ? (
          <p className="text-xs text-gray-500">
            {formatProDateOnly(selected.birth_date)
              ? `В кейс подтянется: ${formatProDateOnly(selected.birth_date)}${
                  selected.birth_place ? `, ${selected.birth_place}` : ""
                }`
              : "У клиента нет даты — заполните на следующем шаге (и сохранится в карточку)."}
          </p>
        ) : null}

        <fieldset>
          <legend className="text-sm text-gray-300">Практика</legend>
          <div className="mt-2 flex flex-col gap-2">
            {PRACTICES.map((p) => (
              <label
                key={p.value}
                className="flex cursor-pointer items-start gap-2 rounded border border-[#c9a24a]/25 px-3 py-2 text-sm"
              >
                <input
                  type="radio"
                  name="practice"
                  className="mt-1"
                  checked={type === p.value}
                  onChange={() => setType(p.value)}
                />
                <span>
                  <span className="text-[#ede6da]">{p.label}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">{p.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="text-sm text-gray-300">
          Вопрос / фокус (по желанию)
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
          disabled={!clientId || busy}
          onClick={() => void create()}
        >
          {busy ? "Создание…" : "Далее — данные рождения"}
        </button>
      </div>
    </ProShell>
  );
}
