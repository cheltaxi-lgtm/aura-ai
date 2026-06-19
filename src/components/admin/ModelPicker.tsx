"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Search } from "lucide-react";

export interface ModelOption {
  id: string;
  name: string;
  contextLength?: number;
  supportsVision?: boolean;
  supportsSpeech?: boolean;
  supportsImage?: boolean;
  supportsRussian?: boolean;
  pricingHint?: string;
}

interface ModelPickerProps {
  label: string;
  value: string;
  onChange: (modelId: string) => void;
  visionOnly?: boolean;
  speechOnly?: boolean;
  imageOnly?: boolean;
  placeholder?: string;
}

export default function ModelPicker({
  label,
  value,
  onChange,
  visionOnly = false,
  speechOnly = false,
  imageOnly = false,
  placeholder = "Начните вводить название модели…",
}: ModelPickerProps) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const modelsUrl = speechOnly
    ? "/api/admin/models?type=tts"
    : imageOnly
      ? "/api/admin/models?type=image"
      : "/api/admin/models";

  useEffect(() => {
    setLoading(true);
    fetch(modelsUrl)
      .then((r) => r.json())
      .then((d) => setModels(d.models ?? []))
      .finally(() => setLoading(false));
  }, [modelsUrl]);

  useEffect(() => {
    const selected = models.find((m) => m.id === value);
    if (selected && !open) {
      setQuery(selected.name === selected.id ? selected.id : `${selected.name} (${selected.id})`);
    } else if (!value && !open) {
      setQuery("");
    }
  }, [value, models, open]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const pool = useMemo(() => {
    if (speechOnly) return models.filter((m) => m.supportsSpeech !== false);
    if (imageOnly) return models.filter((m) => m.supportsImage !== false);
    if (visionOnly) return models.filter((m) => m.supportsVision);
    return models;
  }, [models, visionOnly, speechOnly, imageOnly]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const limit = speechOnly || imageOnly ? pool.length : q ? 60 : 40;
    if (!q) return pool.slice(0, limit);
    return pool
      .filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          (m.pricingHint?.toLowerCase().includes(q) ?? false)
      )
      .slice(0, limit);
  }, [pool, query, speechOnly, imageOnly]);

  const selectModel = (model: ModelOption) => {
    onChange(model.id);
    setQuery(model.name === model.id ? model.id : `${model.name} (${model.id})`);
    setOpen(false);
  };

  const poolLabel = speechOnly
    ? " для озвучки"
    : imageOnly
      ? " для генерации изображений"
      : visionOnly
        ? " с поддержкой фото"
        : "";

  return (
    <div ref={rootRef} className="relative">
      <label className="mb-1 block text-xs text-gray-500">{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={query}
          placeholder={loading ? "Загрузка моделей…" : placeholder}
          disabled={loading}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-10 pr-10 text-sm text-white"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-500" />
        ) : (
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        )}
      </div>

      {value && (
        <p className="mt-1 truncate text-[11px] text-aura-neon" title={value}>
          ID: {value}
        </p>
      )}

      {open && !loading && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-white/10 bg-[#12121a] shadow-neon">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500">Ничего не найдено</p>
          ) : (
            filtered.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => selectModel(model)}
                className={`block w-full border-b border-white/5 px-4 py-3 text-left transition-colors hover:bg-aura-purple/10 ${
                  model.id === value ? "bg-aura-purple/15" : ""
                }`}
              >
                <p className="text-sm font-medium text-white">{model.name}</p>
                <p className="truncate text-xs text-gray-500">{model.id}</p>
                <p className="mt-0.5 text-[10px] text-gray-600">
                  {model.contextLength ? `${Math.round(model.contextLength / 1000)}k ctx` : ""}
                  {model.pricingHint ? ` · ${model.pricingHint}` : ""}
                  {speechOnly || model.supportsSpeech ? " · речь" : ""}
                  {speechOnly && model.supportsRussian === false ? " · без RU" : ""}
                  {speechOnly && model.supportsRussian ? " · RU" : ""}
                  {imageOnly || model.supportsImage ? " · арт" : ""}
                  {!speechOnly && !imageOnly && (visionOnly || model.supportsVision) ? " · фото" : ""}
                </p>
              </button>
            ))
          )}
        </div>
      )}

      <p className="mt-1 text-[10px] text-gray-600">
        {pool.length} моделей{poolLabel} · OpenRouter
      </p>
    </div>
  );
}
