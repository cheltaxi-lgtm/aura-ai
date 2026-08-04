"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import HdComposite from "./HdComposite";
import type { HdChartPayload } from "./HdChartView";
import { hdApiErrorMessage } from "./hd-errors";
import { claimAllPendingHdCharts, storeHdClaimToken } from "./hd-claim";

interface PlaceSuggestion {
  label: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

interface PersonState {
  name: string;
  birthDate: string;
  birthTime: string;
  timeUnknown: boolean;
  placeQuery: string;
  place: PlaceSuggestion | null;
  suggestions: PlaceSuggestion[];
  placesOpen: boolean;
  chart: HdChartPayload | null;
  loading: boolean;
  error: string | null;
}

const EMPTY: PersonState = {
  name: "",
  birthDate: "",
  birthTime: "",
  timeUnknown: false,
  placeQuery: "",
  place: null,
  suggestions: [],
  placesOpen: false,
  chart: null,
  loading: false,
  error: null,
};

function PersonForm({
  title,
  state,
  onChange,
  onCompute,
}: {
  title: string;
  state: PersonState;
  onChange: (patch: Partial<PersonState>) => void;
  onCompute: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        onChange({ placesOpen: false });
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchPlaces = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (q.trim().length < 2) {
        onChange({ suggestions: [] });
        return;
      }
      debounceRef.current = setTimeout(() => {
        fetch(`/api/human-design/places?q=${encodeURIComponent(q.trim())}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            onChange({
              suggestions: Array.isArray(d?.places) ? d.places : [],
              placesOpen: true,
            });
          })
          .catch(() => onChange({ suggestions: [] }));
      }, 250);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div className="hd-panel">
      <p className="hd-field__label mb-3">{title}</p>

      <div className="hd-field mb-4">
        <label className="hd-field__label">Имя</label>
        <input
          type="text"
          value={state.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Например, Мария"
          maxLength={60}
          className="hd-field__input"
          autoComplete="off"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="hd-field">
          <label className="hd-field__label">Дата рождения</label>
          <input
            type="date"
            value={state.birthDate}
            onChange={(e) => onChange({ birthDate: e.target.value })}
            className="hd-field__input"
            min="1900-01-01"
            max={new Date().toISOString().slice(0, 10)}
          />
        </div>
        <div className="hd-field">
          <label className="hd-field__label">Время рождения</label>
          <input
            type="time"
            value={state.birthTime}
            onChange={(e) => onChange({ birthTime: e.target.value })}
            className="hd-field__input"
            disabled={state.timeUnknown}
          />
          <label className="flex items-center gap-2 text-xs text-white/55">
            <input
              type="checkbox"
              checked={state.timeUnknown}
              onChange={(e) => onChange({ timeUnknown: e.target.checked })}
              className="accent-amber-500"
            />
            Не знаю время
          </label>
        </div>
        <div className="hd-field relative sm:col-span-2" ref={boxRef}>
          <label className="hd-field__label">Место рождения</label>
          <input
            type="text"
            value={state.placeQuery}
            onChange={(e) => {
              onChange({ placeQuery: e.target.value, place: null });
              searchPlaces(e.target.value);
            }}
            onFocus={() => state.suggestions.length && onChange({ placesOpen: true })}
            placeholder="Начните вводить город…"
            className="hd-field__input"
            autoComplete="off"
          />
          {state.placesOpen && state.suggestions.length > 0 && (
            <div className="hd-places" role="listbox">
              {state.suggestions.map((s) => (
                <button
                  key={`${s.label}-${s.latitude}`}
                  type="button"
                  className="hd-places__item"
                  onClick={() =>
                    onChange({ place: s, placeQuery: s.label, placesOpen: false })
                  }
                >
                  {s.label}
                  <small>{s.timezone}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {state.error && <p className="mt-3 text-sm text-red-300">{state.error}</p>}

      <button
        type="button"
        onClick={onCompute}
        disabled={state.loading}
        className="btn-luxe btn-luxe--gold mt-4 w-full disabled:opacity-60"
      >
        {state.loading
          ? "Рассчитываем…"
          : state.chart
            ? "Пересчитать карту"
            : "Рассчитать карту"}
      </button>
      {state.chart && (
        <p className="mt-2 text-center text-xs text-emerald-200/80">
          Карта готова · {state.chart.chart.activeGates.length} активных ворот
        </p>
      )}
    </div>
  );
}

/** Guest-friendly compatibility flow: two birth-data forms → composite bodygraph. */
export default function HdCompatibilityCalculator() {
  const [a, setA] = useState<PersonState>(EMPTY);
  const [b, setB] = useState<PersonState>(EMPTY);

  // Logged-in visitors get every guest chart this browser created (including
  // the pair computed here) attached to their account.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.authenticated && !d?.needsProfile) void claimAllPendingHdCharts();
      })
      .catch(() => undefined);
  }, []);

  const compute = useCallback(
    async (
      state: PersonState,
      patch: (p: Partial<PersonState>) => void
    ): Promise<HdChartPayload | null> => {
      patch({ error: null });
      if (!state.name.trim()) {
        patch({ error: "Укажите имя." });
        return null;
      }
      if (!state.birthDate) {
        patch({ error: "Укажите дату рождения." });
        return null;
      }
      if (!state.timeUnknown && !state.birthTime) {
        patch({ error: "Укажите время рождения или отметьте «не знаю время»." });
        return null;
      }
      if (!state.place) {
        patch({ error: "Выберите место рождения из списка." });
        return null;
      }
      patch({ loading: true });
      try {
        const res = await fetch("/api/human-design/chart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            birthDate: state.birthDate,
            birthTime: state.timeUnknown ? null : state.birthTime,
            timezone: state.place.timezone,
            placeName: state.place.label,
            lat: state.place.latitude,
            lon: state.place.longitude,
            subjectKind: "other",
            subjectName: state.name.trim(),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          patch({
            error: hdApiErrorMessage(data, "Не удалось рассчитать карту."),
            loading: false,
          });
          return null;
        }
        const payload = data.chart as HdChartPayload;
        // Guest chart: keep the claim capability so a later login attaches it.
        storeHdClaimToken(payload.fingerprint, data.claimToken);
        patch({ chart: payload, loading: false });
        return payload;
      } catch {
        patch({ error: "Сеть недоступна. Попробуйте ещё раз.", loading: false });
        return null;
      }
    },
    []
  );

  const computeA = useCallback(async () => {
    await compute(a, (p) => setA((prev) => ({ ...prev, ...p })));
  }, [a, compute]);

  const computeB = useCallback(async () => {
    await compute(b, (p) => setB((prev) => ({ ...prev, ...p })));
  }, [b, compute]);

  const both = a.chart && b.chart;

  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-2">
        <PersonForm title="Первый человек" state={a} onChange={(p) => setA((prev) => ({ ...prev, ...p }))} onCompute={() => void computeA()} />
        <PersonForm title="Второй человек" state={b} onChange={(p) => setB((prev) => ({ ...prev, ...p }))} onCompute={() => void computeB()} />
      </div>

      {both && (
        <div>
          <h2 className="mb-4 font-display text-xl font-bold text-amber-50">
            Композит: {a.name.trim()} + {b.name.trim()}
          </h2>
          <HdComposite key={`${a.chart!.id}:${b.chart!.id}`} base={a.chart!} partner={b.chart!} />
        </div>
      )}

      {!both && (
        <p className="text-center text-[0.6875rem] leading-relaxed text-white/40">
          Рассчитайте обе карты — композитный бодиграф пары появится автоматически.
          Расчёт бесплатный и не требует регистрации.
        </p>
      )}
    </div>
  );
}
