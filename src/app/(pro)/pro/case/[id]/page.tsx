"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import ProShell from "@/modules/pro/ui/ProShell";
import { waitForAsyncJob } from "@/lib/client/wait-for-async-job";
import { DESTINY_MATRIX_UI_SLOT_COUNT } from "@/components/numerolog/DestinyMatrixGrid";
import {
  polishProReportPlainText,
  polishProReportTitle,
} from "@/modules/pro/ai/report-plain";

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const NatalChartWheel = dynamic(
  () => import("@/components/natal/NatalChartWheel"),
  { ssr: false }
);
const DestinyMatrixGrid = dynamic(
  () => import("@/components/numerolog/DestinyMatrixGrid"),
  { ssr: false }
);
const Bodygraph = dynamic(
  () => import("@/components/human-design/Bodygraph"),
  { ssr: false }
);

type Block = { id: string; title: string; body: string };
type PlaceHit = {
  label: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

const BIRTH_TYPES = new Set(["natal", "matrix", "hd"]);

export default function ProCasePage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [cards, setCards] = useState("Шут, Маг, Жрица");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [deliverUrl, setDeliverUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingElapsedSec, setGeneratingElapsedSec] = useState(0);

  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [timeKnown, setTimeKnown] = useState(true);
  const [birthPlace, setBirthPlace] = useState("");
  const [placeHits, setPlaceHits] = useState<PlaceHit[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceHit | null>(null);
  const [ttl, setTtl] = useState<"7" | "30" | "90" | "forever">("30");

  const deliverStorageKey = `pro-case-deliver-url-${params.id}`;

  useEffect(() => {
    if (!generating) {
      setGeneratingElapsedSec(0);
      return;
    }
    setGeneratingElapsedSec(0);
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setGeneratingElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [generating]);

  async function load() {
    const res = await fetch(`/api/pro/cases/${params.id}`, { credentials: "include" });
    const json = await res.json();
    if (res.ok) {
      setData(json);
      const latest = [...(json.versions || [])].reverse()[0];
      if (latest?.blocks) {
        setBlocks(
          latest.blocks.map((b: Block) => ({
            ...b,
            title: polishProReportTitle(b.title || ""),
            body: polishProReportPlainText(b.body || ""),
          }))
        );
      }
      const p = json.input?.payload || {};
      const cl = json.client || {};
      const birthDateVal = p.birthDate || cl.birth_date;
      const birthTimeVal = p.birthTime || cl.birth_time;
      const placeVal = p.birthPlace || p.birthCity || cl.birth_place;
      const lat = p.latitude ?? p.birthLat ?? cl.birth_lat;
      const lon = p.longitude ?? p.birthLon ?? cl.birth_lon;
      const tz = p.timezone || p.birthTz || cl.birth_tz;
      if (birthDateVal) setBirthDate(String(birthDateVal).slice(0, 10));
      if (birthTimeVal) {
        setBirthTime(String(birthTimeVal).slice(0, 5));
        setTimeKnown(true);
      } else if (typeof p.timeKnown === "boolean") {
        setTimeKnown(p.timeKnown);
      }
      if (placeVal) setBirthPlace(String(placeVal));
      if (typeof lat === "number" && typeof lon === "number" && tz) {
        setSelectedPlace({
          label: String(placeVal || ""),
          latitude: lat,
          longitude: lon,
          timezone: String(tz),
        });
      }
      try {
        const cached = sessionStorage.getItem(deliverStorageKey);
        if (cached) setDeliverUrl(cached);
      } catch {
        /* ignore */
      }
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    if (birthPlace.trim().length < 2) {
      setPlaceHits([]);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        const res = await fetch(
          `/api/pro/places?q=${encodeURIComponent(birthPlace.trim())}`,
          { credentials: "include" }
        );
        const json = await res.json();
        if (res.ok) setPlaceHits(json.places || []);
      })();
    }, 280);
    return () => clearTimeout(t);
  }, [birthPlace]);

  const absoluteDeliverUrl = useMemo(() => {
    if (!deliverUrl) return null;
    if (deliverUrl.startsWith("http")) return deliverUrl;
    if (typeof window === "undefined") return deliverUrl;
    return `${window.location.origin}${deliverUrl.startsWith("/") ? "" : "/"}${deliverUrl}`;
  }, [deliverUrl]);

  const snapshot = data?.input?.payload?.chartSnapshot as
    | {
        caseType?: string;
        western?: Record<string, unknown>;
        timeKnown?: boolean;
        matrix?: any;
        hdChart?: any;
      }
    | undefined;

  async function patch(action: string, body: Record<string, unknown> = {}) {
    setMsg(null);
    setBusy(true);
    const res = await fetch(`/api/pro/cases/${params.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(json.message || json.error || "Ошибка");
      return json;
    }
    if (json.version?.blocks) setBlocks(json.version.blocks);
    const nextUrl =
      typeof json.url === "string"
        ? json.url
        : typeof json.token === "string"
          ? `/r/${json.token}`
          : null;
    if (nextUrl) {
      setDeliverUrl(nextUrl);
      try {
        sessionStorage.setItem(deliverStorageKey, nextUrl);
      } catch {
        /* ignore */
      }
      const abs =
        nextUrl.startsWith("http")
          ? nextUrl
          : `${window.location.origin}${nextUrl.startsWith("/") ? "" : "/"}${nextUrl}`;
      try {
        await navigator.clipboard.writeText(abs);
        setMsg("Ссылка готова и скопирована в буфер");
      } catch {
        setMsg("Ссылка готова — скопируйте ниже");
      }
      await load();
      return json;
    }
    await load();
    setMsg(action === "save_human" ? "Отчёт принят" : "Сохранено");
    return json;
  }

  async function deliver() {
    await patch("deliver", { ttl, dialogMode: "b", blocks });
  }

  function birthPayload() {
    return {
      birthDate: birthDate || undefined,
      birthTime: timeKnown && birthTime ? birthTime : null,
      timeKnown: timeKnown && Boolean(birthTime),
      birthPlace: selectedPlace?.label || birthPlace || undefined,
      birthCity: selectedPlace?.label || birthPlace || undefined,
      latitude: selectedPlace?.latitude,
      longitude: selectedPlace?.longitude,
      timezone: selectedPlace?.timezone,
      birthLat: selectedPlace?.latitude,
      birthLon: selectedPlace?.longitude,
      birthTz: selectedPlace?.timezone,
    };
  }

  async function generate() {
    setMsg(null);
    setBusy(true);
    setGenerating(true);
    const res = await fetch(`/api/pro/cases/${params.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "generate",
        idempotencyKey: `ui-${params.id}-gen-${Date.now()}`,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setBusy(false);
      setGenerating(false);
      setMsg(json.error || json.message || "Ошибка генерации");
      return;
    }
    if (json.async && json.jobId) {
      const caseType = String(data?.case?.type || "");
      const etaHint =
        caseType === "hd"
          ? " Обычно 6–12 минут — можно оставить вкладку открытой."
          : " Обычно 2–5 минут.";
      setMsg(`Мастер готовит премиум-отчёт…${etaHint}`);
      try {
        // HD sectional ≈ 6–12 min; 400 × 2.5s ≈ 16.6 min ceiling.
        await waitForAsyncJob({
          jobId: json.jobId,
          storageKey: `pro-case-job-${params.id}`,
          maxAttempts: 400,
          pollIntervalMs: 2500,
        });
        setMsg("Отчёт готов");
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Генерация не завершилась");
      }
      await load();
      setBusy(false);
      setGenerating(false);
      return;
    }
    if (json.version?.blocks) setBlocks(json.version.blocks);
    await load();
    setBusy(false);
    setGenerating(false);
    setMsg("Отчёт готов");
  }

  if (!data) {
    return (
      <ProShell title="Практика">
        <p className="text-sm text-gray-400">Загрузка…</p>
      </ProShell>
    );
  }

  const c = data.case;
  const isBirth = BIRTH_TYPES.has(c.type);
  const chartOk = Boolean(data.input?.payload?.chartFacts?.ok);

  return (
    <ProShell title={`Практика · ${c.type}`}>
      <p className="text-sm text-gray-400">
        Статус: {c.status} · клиент: {data.client?.alias}
      </p>
      {c.question ? (
        <p className="mt-2 text-sm text-[#ede6da]">Фокус: {c.question}</p>
      ) : null}

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
            disabled={busy}
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

      {isBirth && (
        <div className="mt-6 space-y-3 rounded border border-[#c9a24a]/20 p-4">
          <p className="text-sm text-[#e8c77e]">Данные для практики</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-gray-300">
              Дата рождения
              <input
                type="date"
                className="mt-1 w-full rounded border border-[#c9a24a]/30 bg-black/30 px-3 py-2"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </label>
            {c.type !== "matrix" ? (
              <label className="text-sm text-gray-300">
                Время
                <input
                  type="time"
                  className="mt-1 w-full rounded border border-[#c9a24a]/30 bg-black/30 px-3 py-2"
                  value={birthTime}
                  disabled={!timeKnown}
                  onChange={(e) => setBirthTime(e.target.value)}
                />
              </label>
            ) : null}
          </div>
          {c.type !== "matrix" ? (
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={timeKnown}
                onChange={(e) => setTimeKnown(e.target.checked)}
              />
              Время рождения известно
            </label>
          ) : null}
          {c.type !== "matrix" ? (
            <>
              <label className="block text-sm text-gray-300">
                Город рождения
                <input
                  className="mt-1 w-full rounded border border-[#c9a24a]/30 bg-black/30 px-3 py-2"
                  value={birthPlace}
                  onChange={(e) => {
                    setBirthPlace(e.target.value);
                    setSelectedPlace(null);
                  }}
                  placeholder="Начните вводить город…"
                  autoComplete="off"
                />
              </label>
              {placeHits.length > 0 && !selectedPlace ? (
                <ul className="max-h-40 overflow-auto rounded border border-[#c9a24a]/20 bg-black/40 text-sm">
                  {placeHits.map((p) => (
                    <li key={`${p.label}-${p.latitude}`}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-gray-200 hover:bg-[#c9a24a]/10"
                        onClick={() => {
                          setSelectedPlace(p);
                          setBirthPlace(p.label);
                          setPlaceHits([]);
                        }}
                      >
                        {p.label}
                        <span className="ml-2 text-xs text-gray-500">{p.timezone}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            className="btn-neon px-4 py-2 text-sm"
            disabled={busy || !birthDate}
            onClick={() => void patch("input", { payload: birthPayload() })}
          >
            Сохранить данные
          </button>
          <p className="text-xs text-gray-500">
            Расчёт карты: {chartOk ? "готов" : "нужно сохранить данные"}
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-neon px-4 py-2 text-sm"
          disabled={busy || generating}
          onClick={() => void generate()}
        >
          {generating
            ? `Генерация… ${formatElapsed(generatingElapsedSec)}`
            : "Сгенерировать премиум-отчёт"}
        </button>
        <button
          type="button"
          className="btn-neon px-4 py-2 text-sm"
          disabled={busy || !blocks.length}
          onClick={() => void patch("save_human", { blocks })}
        >
          Принять отчёт
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-400">
          TTL
          <select
            className="rounded border border-[#c9a24a]/30 bg-black/30 px-2 py-1"
            value={ttl}
            onChange={(e) => setTtl(e.target.value as typeof ttl)}
          >
            <option value="7">7 дней</option>
            <option value="30">30 дней</option>
            <option value="90">90 дней</option>
            <option value="forever">бессрочно</option>
          </select>
        </label>
        <button
          type="button"
          className="btn-neon px-4 py-2 text-sm"
          disabled={busy || !blocks.length}
          onClick={() => void deliver()}
        >
          Выдать ссылку клиенту
        </button>
        <button
          type="button"
          className="rounded border border-red-400/30 px-4 py-2 text-sm text-red-200/90"
          disabled={busy || data?.case?.status === "archived"}
          onClick={() => {
            if (!confirm("Архивировать кейс? Он исчезнет из активного списка.")) return;
            void patch("archive");
          }}
        >
          В архив
        </button>
      </div>
      {!blocks.length ? (
        <p className="mt-2 text-xs text-gray-500">
          Ссылка появится после генерации отчёта. «Выдать ссылку» также принимает
          текущий черновик.
        </p>
      ) : null}

      {msg && (
        <p className="mt-3 text-sm text-[#e8c77e]">
          {msg}
          {generating
            ? ` ${formatElapsed(generatingElapsedSec)}${
                generatingElapsedSec >= 60
                  ? " — мастер всё ещё пишет, это нормально"
                  : ""
              }`
            : ""}
        </p>
      )}
      {absoluteDeliverUrl && (
        <div className="mt-4 rounded-lg border border-[#c9a24a]/40 bg-black/40 p-4">
          <p className="text-sm font-medium text-[#e8c77e]">Ссылка для клиента</p>
          <a
            href={absoluteDeliverUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block break-all text-sm text-[#ede6da] underline decoration-[#c9a24a]/50"
          >
            {absoluteDeliverUrl}
          </a>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-neon px-3 py-1.5 text-xs"
              onClick={() => void navigator.clipboard.writeText(absoluteDeliverUrl)}
            >
              Копировать
            </button>
            <a
              href={absoluteDeliverUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-[#c9a24a]/40 px-3 py-1.5 text-xs text-[#e8c77e]"
            >
              Открыть
            </a>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Токен показывается при выдаче; сохраните ссылку — повторно из БД её не
            восстановить.
          </p>
        </div>
      )}

      {snapshot?.western ? (
        <div className="mt-8 flex justify-center">
          <NatalChartWheel
            western={snapshot.western}
            timeKnown={Boolean(snapshot.timeKnown)}
            size={320}
          />
        </div>
      ) : null}
      {snapshot?.matrix ? (
        <div className="mt-8">
          <DestinyMatrixGrid
            matrix={snapshot.matrix}
            revealed={DESTINY_MATRIX_UI_SLOT_COUNT}
          />
        </div>
      ) : null}
      {snapshot?.hdChart ? (
        <div className="mt-8 flex justify-center">
          <Bodygraph chart={snapshot.hdChart} />
        </div>
      ) : null}

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
              rows={8}
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
