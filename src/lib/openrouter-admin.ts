import { openRouterAppHeaders } from "@/lib/brand";
import { openRouterFetch } from "@/lib/openrouter-fetch";
import { isOpenRouterConfigured } from "@/lib/llm";
import { getLlmConcurrencyStats } from "@/lib/llm-concurrency";
import { getAdminAiSettings } from "@/lib/ai-model";
import { getSetting } from "@/lib/settings";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export type OpenRouterKeyStatus = "ok" | "missing" | "invalid" | "low_balance" | "error";

export type OpenRouterKeyInfo = {
  label: string;
  limit: number | null;
  limitRemaining: number | null;
  limitReset: string | null;
  usageAllTime: number;
  usageDaily: number;
  usageWeekly: number;
  usageMonthly: number;
  byokUsageMonthly: number;
  isFreeTier: boolean;
};

export type OpenRouterCreditsInfo = {
  totalCredits: number;
  totalUsage: number;
  remaining: number;
};

export type OpenRouterActivityRow = {
  date: string;
  model: string;
  providerName: string;
  requests: number;
  usageUsd: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
};

export type OpenRouterModelAggregate = {
  model: string;
  providerName: string;
  requests: number;
  usageUsd: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  lastDate: string;
};

export type OpenRouterDailySpend = {
  date: string;
  usageUsd: number;
  requests: number;
};

export type OpenRouterBalanceForecast = {
  available: boolean;
  reason: string | null;
  balanceUsd: number | null;
  balanceSource: "account" | "key_limit" | null;
  dailyBurnUsd: number | null;
  burnMethod: "today" | "avg_7d" | "avg_3d" | "week_avg" | "month_avg" | null;
  burnMethodLabel: string | null;
  sampleDays: number;
  daysRemaining: number | null;
  depletionDate: string | null;
  projectedWeekSpend: number | null;
  projectedMonthSpend: number | null;
  urgency: "ok" | "warning" | "critical" | "unknown";
};

export type OpenRouterAdminSnapshot = {
  fetchedAt: string;
  keyConfigured: boolean;
  keyStatus: OpenRouterKeyStatus;
  keyStatusMessage: string;
  keyHint: string | null;
  key: OpenRouterKeyInfo | null;
  credits: OpenRouterCreditsInfo | null;
  creditsAvailable: boolean;
  creditsNote: string | null;
  activityAvailable: boolean;
  activityNote: string | null;
  activityDays: number;
  dailySpend: OpenRouterDailySpend[];
  byModel: OpenRouterModelAggregate[];
  recentActivity: OpenRouterActivityRow[];
  forecast: OpenRouterBalanceForecast;
  llm: ReturnType<typeof getLlmConcurrencyStats>;
  configuredModels: {
    chat: string;
    freeChat: string;
    paidChat: string;
    vision: string;
    tts: string;
    ttsFallback: string;
    image: string;
    imageFallback: string;
    embed: string;
  };
};

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function addUtcDays(from: Date, days: number): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + Math.floor(days));
  return d.toISOString().slice(0, 10);
}

function computeBalanceForecast(params: {
  key: OpenRouterKeyInfo | null;
  credits: OpenRouterCreditsInfo | null;
  dailySpend: OpenRouterDailySpend[];
}): OpenRouterBalanceForecast {
  const empty: OpenRouterBalanceForecast = {
    available: false,
    reason: null,
    balanceUsd: null,
    balanceSource: null,
    dailyBurnUsd: null,
    burnMethod: null,
    burnMethodLabel: null,
    sampleDays: 0,
    daysRemaining: null,
    depletionDate: null,
    projectedWeekSpend: null,
    projectedMonthSpend: null,
    urgency: "unknown",
  };

  let balanceUsd: number | null = null;
  let balanceSource: OpenRouterBalanceForecast["balanceSource"] = null;

  if (params.credits && params.credits.remaining > 0) {
    balanceUsd = params.credits.remaining;
    balanceSource = "account";
  } else if (
    params.key?.limitRemaining != null &&
    params.key.limit != null &&
    params.key.limit > 0
  ) {
    balanceUsd = params.key.limitRemaining;
    balanceSource = "key_limit";
  }

  if (balanceUsd == null) {
    return {
      ...empty,
      reason: "Нет данных об остатке (безлимитный ключ или нужен OPENROUTER_MANAGEMENT_KEY)",
    };
  }

  if (balanceUsd <= 0) {
    return {
      ...empty,
      available: true,
      balanceUsd: 0,
      balanceSource,
      reason: "Баланс исчерпан",
      urgency: "critical",
    };
  }

  const today = utcToday();
  const completedDays = params.dailySpend
    .filter((d) => d.date && d.date < today && d.usageUsd > 0)
    .slice(0, 7);

  const avgFromActivity = (days: OpenRouterDailySpend[]): number | null => {
    if (!days.length) return null;
    const sum = days.reduce((a, d) => a + d.usageUsd, 0);
    return sum / days.length;
  };

  let dailyBurn: number | null = null;
  let burnMethod: OpenRouterBalanceForecast["burnMethod"] = null;
  let burnMethodLabel: string | null = null;
  let sampleDays = 0;

  const todaySpend = params.key?.usageDaily ?? 0;
  const weekAvg = params.key?.usageWeekly ? params.key.usageWeekly / 7 : null;
  const monthAvg = params.key?.usageMonthly
    ? params.key.usageMonthly / Math.max(1, new Date().getUTCDate())
    : null;

  const avg7 = avgFromActivity(completedDays);
  const avg3 = avgFromActivity(completedDays.slice(0, 3));

  // Prefer today's spend when meaningful; otherwise rolling average.
  if (todaySpend >= 0.001) {
    dailyBurn = todaySpend;
    burnMethod = "today";
    burnMethodLabel = "траты сегодня (UTC)";
    sampleDays = 1;
  } else if (avg7 != null && avg7 > 0) {
    dailyBurn = avg7;
    burnMethod = "avg_7d";
    burnMethodLabel = `среднее за ${completedDays.length} заверш. дней`;
    sampleDays = completedDays.length;
  } else if (avg3 != null && avg3 > 0) {
    dailyBurn = avg3;
    burnMethod = "avg_3d";
    burnMethodLabel = `среднее за ${Math.min(3, completedDays.length)} дня`;
    sampleDays = Math.min(3, completedDays.length);
  } else if (weekAvg != null && weekAvg > 0) {
    dailyBurn = weekAvg;
    burnMethod = "week_avg";
    burnMethodLabel = "неделя ÷ 7";
    sampleDays = 7;
  } else if (monthAvg != null && monthAvg > 0) {
    dailyBurn = monthAvg;
    burnMethod = "month_avg";
    burnMethodLabel = "месяц ÷ дни с начала месяца";
    sampleDays = new Date().getUTCDate();
  }

  if (dailyBurn == null || dailyBurn <= 0) {
    return {
      ...empty,
      available: true,
      balanceUsd,
      balanceSource,
      reason: "Суточный расход ≈ $0 — прогноз неограничен",
      urgency: "ok",
    };
  }

  const daysRemaining = balanceUsd / dailyBurn;
  const depletionDate = addUtcDays(new Date(), daysRemaining);

  let urgency: OpenRouterBalanceForecast["urgency"] = "ok";
  if (daysRemaining < 3) urgency = "critical";
  else if (daysRemaining < 14) urgency = "warning";

  return {
    available: true,
    reason: null,
    balanceUsd,
    balanceSource,
    dailyBurnUsd: dailyBurn,
    burnMethod,
    burnMethodLabel,
    sampleDays,
    daysRemaining,
    depletionDate,
    projectedWeekSpend: dailyBurn * 7,
    projectedMonthSpend: dailyBurn * 30,
    urgency,
  };
}

function apiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY?.trim() || undefined;
}

function managementKey(): string | undefined {
  return (
    process.env.OPENROUTER_MANAGEMENT_KEY?.trim() ||
    process.env.OPENROUTER_API_KEY?.trim() ||
    undefined
  );
}

function headers(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    ...openRouterAppHeaders(),
  };
}

function maskKeyHint(key?: string): string | null {
  if (!key) return null;
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

async function fetchJson<T>(
  path: string,
  key: string
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  try {
    const res = await openRouterFetch(`${OPENROUTER_BASE}${path}`, {
      method: "GET",
      headers: headers(key),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as T & {
      error?: { message?: string; code?: number };
    };
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data: null,
        error: body?.error?.message ?? res.statusText,
      };
    }
    return { ok: true, status: res.status, data: body };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : "network error",
    };
  }
}

function deriveKeyStatus(
  keyRes: { ok: boolean; status: number; error?: string },
  key: OpenRouterKeyInfo | null
): { status: OpenRouterKeyStatus; message: string } {
  if (!isOpenRouterConfigured()) {
    return { status: "missing", message: "OPENROUTER_API_KEY не задан в .env.local" };
  }
  if (!keyRes.ok) {
    if (keyRes.status === 401) {
      return { status: "invalid", message: "Ключ отклонён OpenRouter (401)" };
    }
    return { status: "error", message: keyRes.error ?? "Не удалось проверить ключ" };
  }
  if (
    key?.limitRemaining != null &&
    key.limitRemaining <= 0 &&
    key.limit != null
  ) {
    return { status: "low_balance", message: "Лимит ключа исчерпан" };
  }
  if (key?.limitRemaining != null && key.limit != null && key.limit > 0) {
    const ratio = key.limitRemaining / key.limit;
    if (ratio < 0.1) {
      return { status: "low_balance", message: "Осталось менее 10% лимита ключа" };
    }
  }
  return { status: "ok", message: "Ключ активен, OpenRouter отвечает" };
}

function aggregateByModel(rows: OpenRouterActivityRow[]): OpenRouterModelAggregate[] {
  const map = new Map<string, OpenRouterModelAggregate>();
  for (const row of rows) {
    const cur = map.get(row.model) ?? {
      model: row.model,
      providerName: row.providerName,
      requests: 0,
      usageUsd: 0,
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      lastDate: row.date,
    };
    cur.requests += row.requests;
    cur.usageUsd += row.usageUsd;
    cur.promptTokens += row.promptTokens;
    cur.completionTokens += row.completionTokens;
    cur.reasoningTokens += row.reasoningTokens;
    if (row.date > cur.lastDate) cur.lastDate = row.date;
    map.set(row.model, cur);
  }
  return [...map.values()].sort((a, b) => b.usageUsd - a.usageUsd);
}

function aggregateDaily(rows: OpenRouterActivityRow[]): OpenRouterDailySpend[] {
  const map = new Map<string, OpenRouterDailySpend>();
  for (const row of rows) {
    const cur = map.get(row.date) ?? { date: row.date, usageUsd: 0, requests: 0 };
    cur.usageUsd += row.usageUsd;
    cur.requests += row.requests;
    map.set(row.date, cur);
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}

let cache: { at: number; snapshot: OpenRouterAdminSnapshot } | null = null;
const CACHE_MS = 60_000;

export async function getOpenRouterAdminSnapshot(force = false): Promise<OpenRouterAdminSnapshot> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return cache.snapshot;
  }

  const key = apiKey();
  const mgmt = managementKey();
  const ai = await getAdminAiSettings();
  const tts = await getSetting("tts");
  const visual = await getSetting("visual");

  let keyInfo: OpenRouterKeyInfo | null = null;
  let keyRes: { ok: boolean; status: number; error?: string } = { ok: false, status: 0, error: "no key" };

  if (key) {
    const res = await fetchJson<{ data: Record<string, unknown> }>("/key", key);
    keyRes = res;
    if (res.ok && res.data?.data) {
      const d = res.data.data;
      keyInfo = {
        label: String(d.label ?? "API key"),
        limit: typeof d.limit === "number" ? d.limit : null,
        limitRemaining: typeof d.limit_remaining === "number" ? d.limit_remaining : null,
        limitReset: typeof d.limit_reset === "string" ? d.limit_reset : null,
        usageAllTime: Number(d.usage) || 0,
        usageDaily: Number(d.usage_daily) || 0,
        usageWeekly: Number(d.usage_weekly) || 0,
        usageMonthly: Number(d.usage_monthly) || 0,
        byokUsageMonthly: Number(d.byok_usage_monthly) || 0,
        isFreeTier: d.is_free_tier === true,
      };
    }
  }

  const { status: keyStatus, message: keyStatusMessage } = deriveKeyStatus(keyRes, keyInfo);

  let credits: OpenRouterCreditsInfo | null = null;
  let creditsAvailable = false;
  let creditsNote: string | null = null;

  if (mgmt) {
    const creditsRes = await fetchJson<{ data: { total_credits: number; total_usage: number } }>(
      "/credits",
      mgmt
    );
    if (creditsRes.ok && creditsRes.data?.data) {
      creditsAvailable = true;
      const c = creditsRes.data.data;
      credits = {
        totalCredits: c.total_credits,
        totalUsage: c.total_usage,
        remaining: Math.max(0, c.total_credits - c.total_usage),
      };
    } else if (creditsRes.status === 403) {
      creditsNote =
        "Баланс аккаунта доступен только с Management API key (OPENROUTER_MANAGEMENT_KEY)";
    } else if (!creditsRes.ok) {
      creditsNote = creditsRes.error ?? "Не удалось загрузить баланс аккаунта";
    }
  }

  let activityRows: OpenRouterActivityRow[] = [];
  let activityAvailable = false;
  let activityNote: string | null = null;

  if (mgmt) {
    const activityRes = await fetchJson<{ data: Array<Record<string, unknown>> }>("/activity", mgmt);
    if (activityRes.ok && Array.isArray(activityRes.data?.data)) {
      activityAvailable = true;
      activityRows = activityRes.data.data.map((row) => ({
        date: String(row.date ?? ""),
        model: String(row.model ?? "unknown"),
        providerName: String(row.provider_name ?? ""),
        requests: Number(row.requests) || 0,
        usageUsd: Number(row.usage) || 0,
        promptTokens: Number(row.prompt_tokens) || 0,
        completionTokens: Number(row.completion_tokens) || 0,
        reasoningTokens: Number(row.reasoning_tokens) || 0,
      }));
    } else if (activityRes.status === 403) {
      activityNote =
        "Статистика по моделям (30 дней) требует Management API key (OPENROUTER_MANAGEMENT_KEY)";
    } else if (!activityRes.ok) {
      activityNote = activityRes.error ?? "Не удалось загрузить activity";
    }
  } else {
    activityNote = "Management key не задан — доступны только метрики ключа (день/неделя/месяц)";
  }

  const dailySpend = aggregateDaily(activityRows).slice(0, 30);

  const snapshot: OpenRouterAdminSnapshot = {
    fetchedAt: new Date().toISOString(),
    keyConfigured: isOpenRouterConfigured(),
    keyStatus,
    keyStatusMessage,
    keyHint: maskKeyHint(key),
    key: keyInfo,
    credits,
    creditsAvailable,
    creditsNote,
    activityAvailable,
    activityNote,
    activityDays: 30,
    dailySpend,
    byModel: aggregateByModel(activityRows),
    recentActivity: activityRows
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || b.usageUsd - a.usageUsd)
      .slice(0, 40),
    forecast: computeBalanceForecast({ key: keyInfo, credits, dailySpend }),
    llm: getLlmConcurrencyStats(),
    configuredModels: {
      chat: ai.model,
      freeChat: ai.freeModel ?? ai.model,
      paidChat: ai.paidModel ?? ai.model,
      vision: ai.visionModel,
      tts: tts.model ?? process.env.OPENROUTER_TTS_MODEL ?? "google/gemini-3.1-flash-tts-preview",
      ttsFallback: tts.fallbackModel ?? "hexgrad/kokoro-82m",
      image: visual.model ?? process.env.OPENROUTER_IMAGE_MODEL ?? "bytedance-seed/seedream-4.5",
      imageFallback: visual.fallbackModel ?? "google/gemini-3.1-flash-image-preview",
      embed: process.env.MEMORY_EMBED_MODEL ?? "baai/bge-m3",
    },
  };

  cache = { at: Date.now(), snapshot };
  return snapshot;
}

export function invalidateOpenRouterAdminCache(): void {
  cache = null;
}
