"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import HdChartView, { type HdChartPayload } from "./HdChartView";
import HdReportPanel from "./HdReportPanel";

interface PlaceSuggestion {
  label: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

const STORAGE_KEY = "hd:last-fingerprint";
/** Claim capability issued at guest-chart creation — proves the browser made it. */
const claimTokenKey = (fingerprint: string) => `hd:claim-token:${fingerprint}`;

interface HdCalculatorProps {
  /** Initial chart (e.g. restored from fingerprint in the cabinet). */
  initialChart?: HdChartPayload | null;
  /** returnTo path for the login CTA. */
  returnTo: string;
  /** Fired when a new chart is computed (cabinet list refresh). */
  onChartCreated?: (chart: HdChartPayload) => void;
  /** Fired when a chart is deleted from the «Мои карты» block. */
  onChartDeleted?: (chartId: string) => void;
}

export default function HdCalculator({ initialChart = null, returnTo, onChartCreated, onChartDeleted }: HdCalculatorProps) {
  const [subjectKind, setSubjectKind] = useState<"self" | "other">("self");
  const [subjectName, setSubjectName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [place, setPlace] = useState<PlaceSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HdChartPayload | null>(initialChart);
  const [authenticated, setAuthenticated] = useState(false);
  const [mine, setMine] = useState<HdChartPayload[]>([]);
  const placeBoxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefillDoneRef = useRef(false);
  const prefilledRef = useRef(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAuthenticated(Boolean(d?.authenticated && !d?.needsProfile)))
      .catch(() => setAuthenticated(false));
  }, []);

  // Logged-in visitors see their existing charts above the form.
  useEffect(() => {
    if (!authenticated) return;
    fetch("/api/human-design/mine")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.charts)) setMine(d.charts as HdChartPayload[]);
      })
      .catch(() => undefined);
  }, [authenticated]);

  // Prefill birth data from the cabinet profile + natal chart place (self only).
  useEffect(() => {
    if (!authenticated || subjectKind !== "self" || prefillDoneRef.current) return;
    prefillDoneRef.current = true;
    fetch("/api/human-design/prefill")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const p = d?.prefill;
        if (!p) return;
        prefilledRef.current = true;
        if (typeof p.birthDate === "string" && p.birthDate) setBirthDate(p.birthDate);
        if (typeof p.birthTime === "string" && p.birthTime) {
          setBirthTime(p.birthTime.slice(0, 5));
        } else {
          setTimeUnknown(true);
        }
        if (p.place && typeof p.place.label === "string") {
          setPlace(p.place);
          setPlaceQuery(p.place.label);
        } else if (typeof p.birthCity === "string" && p.birthCity.trim()) {
          // City without coordinates: let the user confirm the suggestion.
          setPlaceQuery(p.birthCity.trim());
          searchPlaces(p.birthCity.trim());
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, subjectKind]);

  const switchSubject = (kind: "self" | "other") => {
    setSubjectKind(kind);
    setError(null);
    if (kind === "other" && prefilledRef.current) {
      // The form holds MY birth data — it must not leak into another person's chart.
      prefilledRef.current = false;
      setBirthDate("");
      setBirthTime("");
      setTimeUnknown(false);
      setPlace(null);
      setPlaceQuery("");
    }
    if (kind === "self") {
      setSubjectName("");
      // Returning from «другому» must restore the cabinet prefill, not leave
      // the form empty (the one-shot prefill guard already fired).
      prefillDoneRef.current = false;
    }
  };

  const deleteMine = useCallback(
    async (chart: HdChartPayload) => {
      const who =
        chart.subjectKind === "other" && chart.subjectName
          ? `«${chart.subjectName}»`
          : "эту карту";
      if (
        !window.confirm(
          `Удалить карту ${who} безвозвратно? Пропадут бодиграф, разбор Эвелины и переписка по нему.`
        )
      ) {
        return;
      }
      const res = await fetch(
        `/api/human-design/chart?id=${encodeURIComponent(chart.id)}`,
        { method: "DELETE", credentials: "include" }
      ).catch(() => null);
      if (!res?.ok) {
        window.alert("Не удалось удалить карту. Попробуйте ещё раз.");
        return;
      }
      setMine((prev) => prev.filter((c) => c.id !== chart.id));
      if (localStorage.getItem(STORAGE_KEY) === chart.fingerprint) {
        localStorage.removeItem(STORAGE_KEY);
      }
      localStorage.removeItem(claimTokenKey(chart.fingerprint));
      if (result?.id === chart.id) setResult(null);
      onChartDeleted?.(chart.id);
    },
    [result, onChartDeleted]
  );

  // Restore the last computed chart (survives the login redirect round-trip).
  useEffect(() => {
    if (initialChart) return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    fetch(`/api/human-design/chart?fingerprint=${encodeURIComponent(stored)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.chart) setResult(d.chart as HdChartPayload);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Claim a guest chart after login (token proves this browser created it).
  useEffect(() => {
    if (!authenticated || !result) return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored === result.fingerprint) {
      const claimToken = localStorage.getItem(claimTokenKey(stored));
      void fetch("/api/human-design/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint: stored, claimToken }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d?.claimed) return; // not ours to claim — adopt happens on recompute
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(claimTokenKey(stored));
          // Cabinet: the claimed chart now belongs to the user — refresh the list.
          onChartCreated?.(result);
        })
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, result]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (placeBoxRef.current && !placeBoxRef.current.contains(e.target as Node)) {
        setPlacesOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const searchPlaces = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetch(`/api/human-design/places?q=${encodeURIComponent(q.trim())}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          setSuggestions(Array.isArray(d?.places) ? d.places : []);
          setPlacesOpen(true);
        })
        .catch(() => setSuggestions([]));
    }, 250);
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    if (subjectKind === "other" && !subjectName.trim()) {
      setError("Укажите имя человека, для которого делается расчёт.");
      return;
    }
    if (!birthDate) {
      setError("Укажите дату рождения.");
      return;
    }
    if (!timeUnknown && !birthTime) {
      setError("Укажите время рождения или отметьте «не знаю время».");
      return;
    }
    if (!place) {
      setError("Выберите место рождения из списка.");
      return;
    }
    setLoading(true);
    try {
      // Recomputing the same data after login adopts the guest row via its token.
      const storedFp = localStorage.getItem(STORAGE_KEY);
      const res = await fetch("/api/human-design/chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthDate,
          birthTime: timeUnknown ? null : birthTime,
          timezone: place.timezone,
          placeName: place.label,
          lat: place.latitude,
          lon: place.longitude,
          subjectKind,
          subjectName: subjectKind === "other" ? subjectName.trim() : null,
          claimToken: storedFp ? localStorage.getItem(claimTokenKey(storedFp)) : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Не удалось рассчитать карту.");
        return;
      }
      const payload = data.chart as HdChartPayload;
      setResult(payload);
      setMine((prev) =>
        prev.some((c) => c.id === payload.id) ? prev : [payload, ...prev]
      );
      localStorage.setItem(STORAGE_KEY, payload.fingerprint);
      if (typeof data.claimToken === "string" && data.claimToken) {
        localStorage.setItem(claimTokenKey(payload.fingerprint), data.claimToken);
      }
      onChartCreated?.(payload);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }, [birthDate, birthTime, place, timeUnknown, subjectKind, subjectName]);

  if (result) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-white/55">
            {payload_line(result)}
          </p>
          <button
            type="button"
            onClick={() => setResult(null)}
            className="hd-bodygraph__export hd-print-hidden"
          >
            Новый расчёт
          </button>
        </div>
        <HdChartView payload={result} />
        <HdReportPanel
          chartId={result.id}
          authenticated={authenticated}
          loginReturnTo={returnTo}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {authenticated && mine.length > 0 && (
        <div className="hd-panel">
          <p className="hd-field__label mb-3">Мои карты</p>
          <div className="flex flex-wrap gap-2">
            {mine.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center overflow-hidden rounded-full border border-amber-300/25 bg-amber-300/5 text-xs text-amber-100/85 transition hover:border-amber-300/50 hover:bg-amber-300/15"
              >
                <button
                  type="button"
                  onClick={() => {
                    setResult(c);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="px-3.5 py-1.5"
                >
                  {c.subjectKind === "other" && c.subjectName
                    ? `${c.subjectName} · `
                    : ""}
                  {c.birthDate.split("-").reverse().join(".")}
                </button>
                <button
                  type="button"
                  aria-label="Удалить карту"
                  title="Удалить карту"
                  onClick={() => void deleteMine(c)}
                  className="border-l border-amber-300/20 px-2 py-1.5 text-amber-100/50 transition hover:bg-red-500/15 hover:text-red-300"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="hd-panel">
        <div className="mb-4">
          <p className="hd-field__label mb-2">Для кого расчёт?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => switchSubject("self")}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                subjectKind === "self"
                  ? "bg-amber-400/90 text-black"
                  : "border border-white/15 text-white/60 hover:border-amber-300/40 hover:text-white/85"
              }`}
            >
              Себе
            </button>
            <button
              type="button"
              onClick={() => switchSubject("other")}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                subjectKind === "other"
                  ? "bg-amber-400/90 text-black"
                  : "border border-white/15 text-white/60 hover:border-amber-300/40 hover:text-white/85"
              }`}
            >
              Другому человеку
            </button>
          </div>
        </div>

        {subjectKind === "other" && (
          <div className="hd-field mb-4">
            <label className="hd-field__label" htmlFor="hd-subject">Имя человека</label>
            <input
              id="hd-subject"
              type="text"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder="Например, Мария"
              maxLength={60}
              className="hd-field__input"
              autoComplete="off"
            />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="hd-field">
            <label className="hd-field__label" htmlFor="hd-date">Дата рождения</label>
          <input
            id="hd-date"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="hd-field__input"
            min="1900-01-01"
            max={new Date().toISOString().slice(0, 10)}
          />
          {birthDate && Number(birthDate.slice(0, 4)) < 1991 && (
            <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-white/40">
              Для рождений в СССР до 1991 года сверьте время с документами: действовали
              декретные смещения, и исторические базы часовых поясов могут расходиться.
            </p>
          )}
        </div>

        <div className="hd-field">
          <label className="hd-field__label" htmlFor="hd-time">Время рождения</label>
          <input
            id="hd-time"
            type="time"
            value={birthTime}
            onChange={(e) => setBirthTime(e.target.value)}
            className="hd-field__input"
            disabled={timeUnknown}
          />
          <label className="flex items-center gap-2 text-xs text-white/55">
            <input
              type="checkbox"
              checked={timeUnknown}
              onChange={(e) => setTimeUnknown(e.target.checked)}
              className="accent-amber-500"
            />
            Не знаю время рождения
          </label>
        </div>

        <div className="hd-field relative sm:col-span-2" ref={placeBoxRef}>
          <label className="hd-field__label" htmlFor="hd-place">Место рождения</label>
          <input
            id="hd-place"
            type="text"
            value={placeQuery}
            onChange={(e) => {
              setPlaceQuery(e.target.value);
              setPlace(null);
              searchPlaces(e.target.value);
            }}
            onFocus={() => suggestions.length && setPlacesOpen(true)}
            placeholder="Начните вводить город…"
            className="hd-field__input"
            autoComplete="off"
          />
          {placesOpen && suggestions.length > 0 && (
            <div className="hd-places" role="listbox" aria-label="Варианты места рождения">
              {suggestions.map((s) => (
                <button
                  key={`${s.label}-${s.latitude}`}
                  type="button"
                  role="option"
                  aria-selected={place?.label === s.label}
                  className="hd-places__item"
                  onClick={() => {
                    setPlace(s);
                    setPlaceQuery(s.label);
                    setPlacesOpen(false);
                  }}
                >
                  {s.label}
                  <small>{s.timezone}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={loading}
        className="btn-luxe btn-luxe--gold mt-5 w-full disabled:opacity-60"
      >
        {loading ? "Рассчитываем…" : "Рассчитать карту"}
      </button>
      <p className="mt-3 text-center text-[0.6875rem] leading-relaxed text-white/40">
        Расчёт бесплатный. Точные эфемериды, истинный лунный узел, 88° солярной дуги.
      </p>
      </div>
    </div>
  );
}

function payload_line(payload: HdChartPayload): string {
  const date = payload.birthDate.split("-").reverse().join(".");
  const time = payload.timeUnknown ? "время неизвестно" : payload.birthTime;
  const who =
    payload.subjectKind === "other" && payload.subjectName
      ? `${payload.subjectName} · `
      : "";
  return `${who}${date} · ${time} · ${payload.placeName}`;
}
