"use client";

import { useEffect, useState } from "react";
import type { ModelOption } from "@/components/admin/ModelPicker";

export type AdminModelListType = "chat" | "tts" | "image" | "vision";

type CacheEntry = {
  models: ModelOption[];
  source?: string;
  fetchedAt: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<AdminModelListType, CacheEntry>();
const inflight = new Map<AdminModelListType, Promise<CacheEntry>>();

function modelsUrlForType(type: AdminModelListType): string {
  if (type === "tts") return "/api/admin/models?type=tts";
  if (type === "image") return "/api/admin/models?type=image";
  if (type === "vision") return "/api/admin/models?type=vision";
  return "/api/admin/models";
}

async function fetchModels(type: AdminModelListType): Promise<CacheEntry> {
  const response = await fetch(modelsUrlForType(type), { credentials: "include" });
  const data = (await response.json().catch(() => ({}))) as {
    models?: ModelOption[];
    source?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error ?? `HTTP ${response.status}`);
  }

  return {
    models: Array.isArray(data.models) ? data.models : [],
    source: data.source,
    fetchedAt: Date.now(),
  };
}

function loadModels(type: AdminModelListType): Promise<CacheEntry> {
  const cached = cache.get(type);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(cached);
  }

  const pending = inflight.get(type);
  if (pending) return pending;

  const promise = fetchModels(type)
    .then((entry) => {
      cache.set(type, entry);
      return entry;
    })
    .finally(() => {
      inflight.delete(type);
    });

  inflight.set(type, promise);
  return promise;
}

export function useAdminModels(type: AdminModelListType) {
  const [models, setModels] = useState<ModelOption[]>(() => cache.get(type)?.models ?? []);
  const [loading, setLoading] = useState(() => !cache.has(type));
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string | undefined>(() => cache.get(type)?.source);

  useEffect(() => {
    let cancelled = false;

    void loadModels(type)
      .then((entry) => {
        if (cancelled) return;
        setModels(entry.models);
        setSource(entry.source);
        setError(entry.models.length ? null : "Список моделей пуст");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Не удалось загрузить модели";
        setError(message);
        setModels([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [type]);

  return { models, loading, error, source };
}
