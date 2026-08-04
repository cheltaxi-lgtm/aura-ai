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

interface HdCalculatorProps {
  /** Initial chart (e.g. restored from fingerprint in the cabinet). */
  initialChart?: HdChartPayload | null;
  /** returnTo path for the login CTA. */
  returnTo: string;
  /** Fired when a new chart is computed (cabinet list refresh). */
  onChartCreated?: (chart: HdChartPayload) => void;
}

export default function HdCalculator({ initialChart = null, returnTo, onChartCreated }: HdCalculatorProps) {
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
  const placeBoxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAuthenticated(Boolean(d?.authenticated && !d?.needsProfile)))
      .catch(() => setAuthenticated(false));
  }, []);

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

  // Claim a guest chart after login.
  useEffect(() => {
    if (!authenticated || !result) return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored === result.fingerprint) {
      void fetch("/api/human-design/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint: stored }),
      }).then(() => localStorage.removeItem(STORAGE_KEY));
    }
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
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Не удалось рассчитать карту.");
        return;
      }
      const payload = data.chart as HdChartPayload;
      setResult(payload);
      localStorage.setItem(STORAGE_KEY, payload.fingerprint);
      onChartCreated?.(payload);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }, [birthDate, birthTime, place, timeUnknown]);

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
    <div className="hd-panel">
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
            <div className="hd-places" role="listbox">
              {suggestions.map((s) => (
                <button
                  key={`${s.label}-${s.latitude}`}
                  type="button"
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

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

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
  );
}

function payload_line(payload: HdChartPayload): string {
  const date = payload.birthDate.split("-").reverse().join(".");
  const time = payload.timeUnknown ? "время неизвестно" : payload.birthTime;
  return `${date} · ${time} · ${payload.placeName}`;
}
