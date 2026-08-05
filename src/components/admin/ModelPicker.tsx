"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { useAdminModels, type AdminModelListType } from "@/hooks/useAdminModels";

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

function formatModelLabel(model: ModelOption): string {
  return model.name === model.id ? model.id : `${model.name} (${model.id})`;
}

function resolveListType(
  speechOnly: boolean,
  imageOnly: boolean,
  visionOnly: boolean
): AdminModelListType {
  if (speechOnly) return "tts";
  if (imageOnly) return "image";
  if (visionOnly) return "vision";
  return "chat";
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
  const listType = resolveListType(speechOnly, imageOnly, visionOnly);
  const { models, loading, error, source } = useAdminModels(listType);

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => models.find((m) => m.id === value), [models, value]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const pool = useMemo(() => {
    if (listType === "tts") return models.filter((m) => m.supportsSpeech !== false);
    if (listType === "image") return models.filter((m) => m.supportsImage !== false);
    if (listType === "vision") return models.filter((m) => m.supportsVision);
    return models;
  }, [models, listType]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const limit = listType === "chat" ? (q ? 80 : 50) : pool.length;
    if (!q) return pool.slice(0, limit);
    return pool
      .filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          (m.pricingHint?.toLowerCase().includes(q) ?? false)
      )
      .slice(0, limit);
  }, [pool, search, listType]);

  const selectModel = (model: ModelOption) => {
    onChange(model.id);
    setSearch("");
    setOpen(false);
  };

  const commitManualModelId = (raw: string) => {
    const id = raw.trim();
    if (!id.includes("/") || id.length < 3) return;
    onChange(id);
    setSearch("");
    setOpen(false);
  };

  const poolLabel = speechOnly
    ? " для озвучки"
    : imageOnly
      ? " для генерации изображений"
      : visionOnly
        ? " с поддержкой фото"
        : "";

  const closedInputValue = selected ? formatModelLabel(selected) : value;
  const inputValue = open ? search : closedInputValue;

  return (
    <div ref={rootRef} className="relative">
      <label className="mb-1 block text-xs text-gray-500">{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={inputValue}
          placeholder={loading ? "Загрузка моделей…" : placeholder}
          disabled={loading}
          onFocus={() => {
            setOpen(true);
            setSearch("");
          }}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitManualModelId(search);
            }
            if (e.key === "Escape") {
              setOpen(false);
              setSearch("");
            }
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
        <p className="mt-1 truncate text-[11px] text-aura-champagne" title={value}>
          ID: {value}
        </p>
      )}

      {error && (
        <p className="mt-1 text-[11px] text-red-400">
          {error}. Проверьте вход в админку и OPENROUTER_API_KEY.
        </p>
      )}

      {open && !loading && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-white/10 bg-[#12121a] shadow-neon">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500">
              {pool.length === 0 ? "Список пуст — обновите страницу" : "Ничего не найдено"}
            </p>
          ) : (
            filtered.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => selectModel(model)}
                className={`block w-full border-b border-white/5 px-4 py-3 text-left transition-colors hover:bg-aura-gold/10 ${
                  model.id === value ? "bg-aura-gold/15" : ""
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
        {loading
          ? "Загрузка…"
          : `${pool.length} моделей${poolLabel}${source ? ` · ${source}` : ""}${listType === "chat" && pool.length > 50 ? " · введите текст для поиска" : ""}`}
        {!loading && source === "fallback" ? " · короткий список, введите ID вручную (provider/model)" : ""}
      </p>
    </div>
  );
}
