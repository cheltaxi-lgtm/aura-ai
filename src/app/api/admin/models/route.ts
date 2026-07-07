import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { openRouterAppHeaders } from "@/lib/brand";
import { openRouterFetch } from "@/lib/openrouter-fetch";
import {
  fallbackModelsForType,
  modelsFromOpenRouterPayload,
  openRouterModelsUrl,
  resolveModelListType,
  type AdminModelOption,
  type ModelListType,
} from "@/lib/openrouter-models";

const CACHE_TTL_MS = 60 * 60 * 1000;
const modelsCache = new Map<
  ModelListType,
  { models: AdminModelOption[]; source: string; expiresAt: number }
>();

function isPlaceholder(key?: string): boolean {
  return !key || key.startsWith("sk-your") || key.startsWith("your-");
}

async function loadModelsForType(
  listType: ModelListType
): Promise<{ models: AdminModelOption[]; source: string }> {
  const cached = modelsCache.get(listType);
  if (cached && cached.expiresAt > Date.now()) {
    return { models: cached.models, source: cached.source };
  }

  const fallback = fallbackModelsForType(listType);
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (isPlaceholder(apiKey)) {
    const result = { models: fallback, source: "fallback" };
    modelsCache.set(listType, { ...result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }

  try {
    const response = await openRouterFetch(openRouterModelsUrl(listType), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...openRouterAppHeaders(),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const result = { models: fallback, source: "fallback" };
      modelsCache.set(listType, { ...result, expiresAt: Date.now() + 60_000 });
      return result;
    }

    const json = await response.json();
    const models = modelsFromOpenRouterPayload(json, listType);
    const result = {
      models,
      source: "openrouter-server",
    };
    modelsCache.set(listType, { ...result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch {
    const result = { models: fallback, source: "fallback" };
    modelsCache.set(listType, { ...result, expiresAt: Date.now() + 60_000 });
    return result;
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const listType = resolveModelListType(request.nextUrl.searchParams.get("type"));
  const { models, source } = await loadModelsForType(listType);

  return NextResponse.json({
    models,
    source,
    total: models.length,
    type: listType,
  });
}
