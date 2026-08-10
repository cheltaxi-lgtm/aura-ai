"use client";

import { useEffect, useState } from "react";

export type ProPlaceHit = {
  label: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

type Props = {
  value: string;
  onChange: (label: string) => void;
  onSelect?: (place: ProPlaceHit | null) => void;
  selected?: ProPlaceHit | null;
  placeholder?: string;
  label?: string;
  className?: string;
  inputClassName?: string;
};

export default function ProPlaceSearch({
  value,
  onChange,
  onSelect,
  selected = null,
  placeholder = "Начните вводить город…",
  label = "Город / место",
  className,
  inputClassName,
}: Props) {
  const [hits, setHits] = useState<ProPlaceHit[]>([]);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2 || selected) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/pro/places?q=${encodeURIComponent(q)}`,
            { credentials: "include" }
          );
          const json = await res.json();
          if (res.ok) setHits(json.places || []);
        } catch {
          setHits([]);
        }
      })();
    }, 280);
    return () => window.clearTimeout(t);
  }, [value, selected]);

  return (
    <div className={className}>
      <label className="block text-sm">
        <span className="pro-label">{label}</span>
        <input
          className={
            inputClassName ||
            "pro-field mt-1 w-full"
          }
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onSelect?.(null);
          }}
          placeholder={placeholder}
          autoComplete="off"
        />
      </label>
      {selected ? (
        <p className="mt-1 text-xs text-[var(--pro-faint)]">
          {selected.timezone} · {selected.latitude.toFixed(2)},{" "}
          {selected.longitude.toFixed(2)}
        </p>
      ) : null}
      {hits.length > 0 && !selected ? (
        <ul className="mt-1 max-h-40 overflow-auto rounded border border-[color:var(--pro-border)] bg-black/40 text-sm">
          {hits.map((p) => (
            <li key={`${p.label}-${p.latitude}-${p.longitude}`}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-[var(--pro-text)] hover:bg-[#c9a24a]/10"
                onClick={() => {
                  onChange(p.label);
                  onSelect?.(p);
                  setHits([]);
                }}
              >
                {p.label}
                <span className="ml-2 text-xs text-[var(--pro-faint)]">
                  {p.timezone}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {value.trim().length >= 2 && !selected && hits.length === 0 ? (
        <p className="mt-1 text-xs text-[var(--pro-faint)]">
          Подсказки появятся при совпадении. Можно сохранить и латиницей:
          Potsdam.
        </p>
      ) : null}
    </div>
  );
}
