"use client";

import { useEffect, useState } from "react";
import type { ModelOption } from "@/components/admin/ModelPicker";
import {
  fallbackModelsForType,
  modelsFromOpenRouterPayload,
  openRouterModelsUrl,
  type ModelListType,
} from "@/lib/openrouter-models";

export type AdminModelListType = ModelListType;

type CacheEntry = {
  models: ModelOption[];
  source?: string;
  fetchedAt: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<AdminModelListType, CacheEntry>();
const inflight = new Map<AdminModelListType, Promise<CacheEntry>>();

function adminModelsApiUrl(type: AdminModelListType): string {
  if (type === "chat") return "/api/admin/models";
  return `/api/admin/models?type=${type}`;
}

/** OpenRouter catalog is public + CORS * — load from browser when server IP is blocked. */
async function fetchModelsFromOpenRouter(type: AdminModelListType): Promise<CacheEntry | null> {
  try {
    const response = await fetch(openRouterModelsUrl(type), {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;

    const payload = await response.json();
    const models = modelsFromOpenRouterPayload(payload, type);
    if (!models.length) return null;

    return {
      models,
      source: "openrouter",
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

async function fetchModelsFromAdminApi(type: AdminModelListType): Promise<CacheEntry> {
  const response = await fetch(adminModelsApiUrl(type), { credentials: "include" });
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

async function fetchModels(type: AdminModelListType): Promise<CacheEntry> {
  const fromBrowser = await fetchModelsFromOpenRouter(type);
  if (fromBrowser) return fromBrowser;

  try {
    return await fetchModelsFromAdminApi(type);
  } catch {
    return {
      models: fallbackModelsForType(type),
      source: "fallback",
      fetchedAt: Date.now(),
    };
  }
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
        setModels(fallbackModelsForType(type));
        setSource("fallback");
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
