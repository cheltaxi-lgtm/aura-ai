import { getAdminAiSettings, getChatModel, getVisionModel } from "./ai-model";
import { openRouterAppHeaders } from "./brand";
import { openRouterFetch } from "./openrouter-fetch";
import { isDegenerateLlmOutput } from "./chat-reply-sanitize";
import type { ChatHistoryMessage } from "./chat-sanitize";
import { acquireLlmSlot, withLlmSlot, wrapStreamWithLlmRelease, type LlmPool } from "./llm-concurrency";

const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";

export type ChatMessage = {
  role: string;
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
};

function isPlaceholder(key?: string): boolean {
  return !key || key.startsWith("sk-your") || key.startsWith("your-");
}

export function isOpenRouterConfigured(): boolean {
  return !isPlaceholder(process.env.OPENROUTER_API_KEY);
}

function openRouterHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    ...openRouterAppHeaders(),
  };
}

/** OpenRouter catalog IDs always contain a slash (e.g. deepseek/deepseek-chat-v3-0324). */
export function isOpenRouterModelId(model: string): boolean {
  return model.includes("/");
}

async function resolveAiSettings() {
  try {
    return await getAdminAiSettings();
  } catch {
    return null;
  }
}

const RETRYABLE_STATUSES = new Set([429, 502, 503]);
const MAX_LLM_ATTEMPTS = 3;
/**
 * Report-pool default per-request timeout. Heavy report sections (large
 * max_tokens via proxy) legitimately exceed the interactive 90s default —
 * aborting them produced the AbortError clusters that killed paid reports.
 */
const REPORT_POOL_TIMEOUT_MS = 180_000;

function retryDelayMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 8000);
}

function isReasoningCapableModel(model: string): boolean {
  const id = model.toLowerCase();
  return (
    id.includes("kimi") ||
    id.includes("thinking") ||
    id.includes("o1") ||
    id.includes("o3") ||
    id.includes("deepseek-r1") ||
    id.includes("deepseek-v4") ||
    // MiMo otherwise burns max_tokens on English CoT with content:null (finish:length).
    id.includes("mimo") ||
    // Gemini 3 thinks by default; paired with isMandatoryReasoningModel (effort:none → 400).
    id.includes("gemini-3")
  );
}

/** Models that reject reasoning: { effort: "none" } — OpenRouter returns 400. */
function isMandatoryReasoningModel(model: string): boolean {
  const id = model.toLowerCase();
  return (
    id.includes("deepseek-v4") ||
    id.includes("deepseek-r1") ||
    // OpenRouter: "Reasoning is mandatory for this endpoint and cannot be disabled."
    id.includes("gemini-3")
  );
}

/** Models that often put the answer in `reasoning` with `content: null` (e.g. MiMo). */
function isReasoningLeakModel(model: string): boolean {
  const id = model.toLowerCase();
  return id.includes("mimo");
}

/**
 * Reject chain-of-thought meta when falling back from empty content.
 * Keeps client-facing prose (readings) and structured JSON for natal paths.
 */
function looksLikeClientFacingProse(text: string): boolean {
  const t = text.trim();
  if (t.length < 160) return false;
  if (
    /^(?:\.?\s*)?(?:Пользователь|Давайте разбер|Разберём по инструк|The user|Let me|I need to|ЖЁСТК)/iu.test(
      t
    )
  ) {
    return false;
  }
  if (/Давайте разберу по инструк/iu.test(t) && !/\*\*[^*]{2,80}\*\*/.test(t)) {
    return false;
  }
  if (/[а-яё]/iu.test(t)) {
    return (
      /\*\*[^*]{2,80}\*\*/.test(t) ||
      /(?:вердикт|простыми словами|##\s)/iu.test(t) ||
      t.split(/\n/).filter((l) => l.trim()).length >= 3
    );
  }
  // Non-RU (JSON / structured) — natal/ritual callers opt into this explicitly.
  return t.startsWith("{") || t.startsWith("[");
}

function extractReasoningText(message: Record<string, unknown> | undefined): string | null {
  if (!message) return null;
  const reasoning = message.reasoning;
  if (typeof reasoning === "string" && reasoning.trim()) return reasoning.trim();
  const reasoningContent = message.reasoning_content;
  if (typeof reasoningContent === "string" && reasoningContent.trim()) {
    return reasoningContent.trim();
  }
  if (Array.isArray(reasoning)) {
    const parts = reasoning
      .map((part) => {
        if (typeof part === "string") return part.trim();
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text.trim();
        }
        return "";
      })
      .filter(Boolean);
    const joined = parts.join("\n").trim();
    return joined || null;
  }
  return null;
}

type CompletionExtractOptions = {
  allowReasoningFallback?: boolean;
  structuredJson?: boolean;
  /**
   * Skip chat spam heuristics (numbered-list density, repeated lines/phrases).
   * Long-form paid reports (HD) have their own section quality gate and legitimately
   * contain 5–7 practice items / parallel day structures that trip those checks.
   */
  skipDegenerateCheck?: boolean;
};

function extractAssistantTextFromMessage(
  message: Record<string, unknown> | undefined,
  opts?: CompletionExtractOptions
): string | null {
  const content = extractAssistantText(message);
  if (content) return content;
  if (!opts?.allowReasoningFallback) return null;
  const reasoning = extractReasoningText(message);
  if (!reasoning) return null;
  // Structured JSON callers need the raw reasoning blob; prose paths filter CoT.
  if (opts.structuredJson) return reasoning;
  return looksLikeClientFacingProse(reasoning) ? reasoning : null;
}

function extractAssistantText(message: Record<string, unknown> | undefined): string | null {
  if (!message) return null;
  const content = message.content;
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed || null;
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text.trim();
        }
        return "";
      })
      .filter(Boolean);
    const joined = parts.join("\n").trim();
    return joined || null;
  }
  return null;
}

const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

const LLM_REFUSAL_PATTERNS: RegExp[] = [
  /作为一个人工/i,
  /人工智能/i,
  /language model/i,
  /(?:I'm|I am) an AI/i,
  /还没学习/i,
  /cannot assist/i,
  /can't assist/i,
  /cannot fulfill/i,
  /can't fulfill/i,
  /unable to fulfill/i,
  /unable to assist/i,
  /I(?:'m| am) not able to/i,
  /I(?:'m| am) sorry,? but I/i,
  /as an ai/i,
  /无法回答/i,
  /暂不(?:支持|提供)/i,
  /Извините,?\s*я не мог/i,
  /я не могу выполнить/i,
  /я не могу помочь/i,
  /не могу ответить на/i,
  // Bare «отказываюсь» is common in HD not-self/boundaries prose — require
  // refusal-shaped framing (help/answer/request), not the verb alone.
  /отказываюсь\s+(?:помочь|ответить|выполнить|продолжить|генерир)/i,
  /я\s+отказываюсь\s+(?:от\s+)?(?:запроса|ответа|помощи)/i,
  /violat(?:e|es|ing) (?:my )?(?:policy|guidelines)/i,
  /against my (?:policy|guidelines)/i,
];

/** True when LLM output must be rejected (empty, refusal, CJK storm, degenerate). */
/** Hard rejects only (CJK / explicit refusal). Use for long-form paid reports
 * that already enforce product-specific structure (HD section gates). */
export function isHardRejectedLlmOutput(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (CJK_RE.test(trimmed)) return true;
  if (LLM_REFUSAL_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  return false;
}

export function isRejectedLlmOutput(text: string): boolean {
  if (isHardRejectedLlmOutput(text)) return true;
  if (isDegenerateLlmOutput(text.trim())) return true;
  return false;
}

function acceptLlmText(
  text: string | null,
  opts?: { structuredJson?: boolean; skipDegenerateCheck?: boolean }
): string | null {
  if (!text?.trim()) return null;
  const trimmed = text.trim();
  // Structured JSON and long-form paid prose: only hard rejects (CJK / refusal).
  // Chat spam heuristics stay for default chat/reading paths.
  if (opts?.structuredJson || opts?.skipDegenerateCheck) {
    if (CJK_RE.test(trimmed)) return null;
    if (LLM_REFUSAL_PATTERNS.some((pattern) => pattern.test(trimmed))) return null;
    return trimmed;
  }
  if (isRejectedLlmOutput(trimmed)) {
    console.warn("LLM output rejected:", trimmed.slice(0, 120));
    return null;
  }
  return trimmed;
}

function openRouterRequestBody(
  base: Record<string, unknown>,
  model: string
): Record<string, unknown> {
  if (base.reasoning !== undefined) return base;
  if (isMandatoryReasoningModel(String(model))) return base;
  if (!isReasoningCapableModel(String(model))) return base;
  return { ...base, reasoning: { effort: "none" } };
}

async function callChatCompletions(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeoutMs = 90000,
  maxAttempts = MAX_LLM_ATTEMPTS,
  extractOpts?: CompletionExtractOptions,
  pool?: LlmPool
): Promise<string | null> {
  const result = await callChatCompletionsDetailed(
    url,
    headers,
    body,
    timeoutMs,
    maxAttempts,
    extractOpts,
    pool
  );
  return result.text;
}

export type ChatCompletionResult = {
  text: string | null;
  finishReason: string | null;
  usage?: { promptTokens?: number; completionTokens?: number };
};

async function callChatCompletionsDetailed(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeoutMs = 90000,
  maxAttempts = MAX_LLM_ATTEMPTS,
  extractOpts?: CompletionExtractOptions,
  pool?: LlmPool
): Promise<ChatCompletionResult> {
  const isOpenRouter = url.includes("openrouter.ai");
  const model = String(body.model ?? "");
  const payload = isOpenRouter ? openRouterRequestBody(body, model) : body;
  // MiMo (and similar) often return content:null with the answer in reasoning.
  if (isReasoningLeakModel(model)) {
    extractOpts = { ...extractOpts, allowReasoningFallback: true };
  }

  const result = await withLlmSlot(
    `complete:${model}`,
    async () => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await (isOpenRouter ? openRouterFetch : fetch)(url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          const retryAfterRaw = response.headers.get("retry-after");
          const retryAfterSec = retryAfterRaw ? Number(retryAfterRaw) : NaN;
          if (RETRYABLE_STATUSES.has(response.status) && attempt < maxAttempts - 1) {
            const backoff = Number.isFinite(retryAfterSec) && retryAfterSec > 0
              ? Math.min(retryAfterSec * 1000, 60_000)
              : retryDelayMs(attempt);
            if (response.status === 429) {
              console.warn(
                `LLM 429 backoff ${backoff}ms attempt=${attempt + 1}/${maxAttempts} model=${model}`
              );
            }
            await new Promise((r) => setTimeout(r, backoff));
            continue;
          }
          console.warn("LLM request failed:", url, response.status, errText);
          return { text: null, finishReason: null };
        }
        const data = await response.json();
        const choice = data.choices?.[0] as
          | { message?: Record<string, unknown>; finish_reason?: string }
          | undefined;
        const rawText = extractAssistantTextFromMessage(choice?.message, extractOpts);
        const finishReason =
          typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
        const usageRaw = data.usage as
          | { prompt_tokens?: number; completion_tokens?: number }
          | undefined;
        const usage =
          usageRaw &&
          (typeof usageRaw.prompt_tokens === "number" ||
            typeof usageRaw.completion_tokens === "number")
            ? {
                promptTokens:
                  typeof usageRaw.prompt_tokens === "number"
                    ? usageRaw.prompt_tokens
                    : undefined,
                completionTokens:
                  typeof usageRaw.completion_tokens === "number"
                    ? usageRaw.completion_tokens
                    : undefined,
              }
            : undefined;
        if (rawText) {
          return {
            text: acceptLlmText(rawText, {
              structuredJson: extractOpts?.structuredJson,
              skipDegenerateCheck: extractOpts?.skipDegenerateCheck,
            }),
            finishReason,
            usage,
          };
        }
        console.warn(
          "LLM empty content:",
          model,
          JSON.stringify(choice?.message)?.slice(0, 200)
        );
        return { text: null, finishReason, usage };
      } catch (error) {
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, retryDelayMs(attempt)));
          continue;
        }
        console.warn("LLM request error:", error);
        return { text: null, finishReason: null };
      } finally {
        clearTimeout(timer);
      }
    }
    return { text: null, finishReason: null };
  }, pool);

  return result ?? { text: null, finishReason: null };
}

async function resolveModel(vision: boolean, isPaid?: boolean): Promise<string> {
  if (vision) return getVisionModel();
  if (isPaid === true) return getChatModel("paid");
  if (isPaid === false) return getChatModel("free");
  return getChatModel("default");
}

function buildRequestBody(
  model: string,
  messages: ChatMessage[],
  aiSettings: Awaited<ReturnType<typeof resolveAiSettings>>,
  opts: {
    maxTokens?: number;
    temperature?: number;
    stream?: boolean;
    jsonObject?: boolean;
  }
): Record<string, unknown> {
  const effectiveMaxTokens = opts.maxTokens ?? aiSettings?.maxTokens ?? 800;
  const effectiveTemp = opts.temperature ?? aiSettings?.temperature ?? 0.85;
  return {
    model,
    messages,
    max_tokens: effectiveMaxTokens,
    temperature: effectiveTemp,
    frequency_penalty: 0.35,
    presence_penalty: 0.2,
    // Prefer lower-latency OpenRouter endpoints when several providers host the model.
    provider: { sort: "latency" },
    ...(opts.stream ? { stream: true } : {}),
    ...(opts.jsonObject ? { response_format: { type: "json_object" } } : {}),
  };
}

export type CompleteChatOptions = {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  vision?: boolean;
  /** Selects admin paidModel vs freeModel when modelOverride is not set. */
  isPaid?: boolean;
  timeoutMs?: number;
  maxAttempts?: number;
  skipTemperatureRetry?: boolean;
  /** Use reasoning field when content is empty (structured outputs only). */
  allowReasoningFallback?: boolean;
  /** Ask OpenRouter/OpenAI for JSON object in content. */
  jsonObject?: boolean;
  /** Override admin chat model (e.g. ritual fallback). */
  modelOverride?: string;
  /**
   * Concurrency pool routing:
   * - interactive (default): chat / ask — ≥60% of LLM_CONCURRENCY_MAX
   * - report: long paid report generation — remainder; never shares FIFO with chat
   * - background: fire-and-forget (memory extraction) — small dedicated pool
   */
  priority?: "background" | "report" | "interactive";
  /**
   * Skip chat-oriented degenerate/spam heuristics. Use for long-form paid
   * reports that already enforce product-specific structure (HD sections).
   */
  skipDegenerateCheck?: boolean;
};

async function completeChatInternal(
  params: CompleteChatOptions
): Promise<string | null> {
  const {
    messages,
    maxTokens,
    temperature,
    vision = false,
    isPaid,
    timeoutMs,
    maxAttempts,
    skipTemperatureRetry = false,
    allowReasoningFallback = false,
    jsonObject = false,
    modelOverride,
    priority,
    skipDegenerateCheck = false,
  } = params;
  const aiSettings = await resolveAiSettings();
  const model = modelOverride ?? (await resolveModel(vision, isPaid));
  const extractOpts: CompletionExtractOptions = {
    allowReasoningFallback,
    structuredJson: jsonObject,
    skipDegenerateCheck,
  };
  const pool: LlmPool =
    priority === "background"
      ? "background"
      : priority === "report"
        ? "report"
        : "interactive";

  const effectiveTimeoutMs = timeoutMs ?? (pool === "report" ? REPORT_POOL_TIMEOUT_MS : undefined);

  const tryOnce = async (temp?: number) =>
    acceptLlmText(
      await callChatCompletions(
        OPENROUTER_API,
        openRouterHeaders(),
        buildRequestBody(model, messages, aiSettings, {
          maxTokens,
          temperature: temp ?? temperature,
          jsonObject,
        }),
        effectiveTimeoutMs,
        maxAttempts,
        extractOpts,
        pool
      ),
      { structuredJson: jsonObject, skipDegenerateCheck }
    );

  if (!isOpenRouterConfigured()) return null;

  const effectiveTemp = temperature ?? aiSettings?.temperature ?? 0.85;
  let text = await tryOnce();
  if (!text && !skipTemperatureRetry) {
    text = await tryOnce(Math.min(effectiveTemp, 0.55));
  }
  return text;
}

export async function completeChat(params: CompleteChatOptions): Promise<string | null> {
  return completeChatInternal(params);
}

/** Like completeChat, but exposes finish_reason for continuation logic. */
export async function completeChatDetailed(params: CompleteChatOptions): Promise<ChatCompletionResult> {
  const {
    messages,
    maxTokens,
    temperature,
    vision = false,
    isPaid,
    timeoutMs,
    maxAttempts,
    skipTemperatureRetry = false,
    allowReasoningFallback = false,
    jsonObject = false,
    modelOverride,
    priority,
    skipDegenerateCheck = false,
  } = params;
  const aiSettings = await resolveAiSettings();
  const model = modelOverride ?? (await resolveModel(vision, isPaid));
  const extractOpts: CompletionExtractOptions = {
    allowReasoningFallback,
    structuredJson: jsonObject,
    skipDegenerateCheck,
  };
  const pool: LlmPool =
    priority === "background"
      ? "background"
      : priority === "report"
        ? "report"
        : "interactive";

  const effectiveTimeoutMs = timeoutMs ?? (pool === "report" ? REPORT_POOL_TIMEOUT_MS : undefined);

  const tryOnce = async (temp?: number) =>
    callChatCompletionsDetailed(
      OPENROUTER_API,
      openRouterHeaders(),
      buildRequestBody(model, messages, aiSettings, {
        maxTokens,
        temperature: temp ?? temperature,
        jsonObject,
      }),
      effectiveTimeoutMs,
      maxAttempts,
      extractOpts,
      pool
    );

  if (!isOpenRouterConfigured()) return { text: null, finishReason: null };

  const effectiveTemp = temperature ?? aiSettings?.temperature ?? 0.85;
  let result = await tryOnce();
  if (!result.text && !skipTemperatureRetry) {
    result = await tryOnce(Math.min(effectiveTemp, 0.55));
  }
  return result;
}

/** Stream chat completions from OpenRouter (SSE). Model from admin settings only. */
export async function streamChat(params: {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  vision?: boolean;
}): Promise<Response | null> {
  if (!isOpenRouterConfigured()) return null;

  const { messages, maxTokens, temperature, vision = false } = params;
  const aiSettings = await resolveAiSettings();
  const model = await resolveModel(vision);
  const body = openRouterRequestBody(
    buildRequestBody(model, messages, aiSettings, {
      maxTokens,
      temperature,
      stream: true,
    }),
    model
  );

  const release = await acquireLlmSlot(`stream:${model}`);
  if (!release) {
    console.warn("LLM stream queue timeout");
    return null;
  }

  try {
    const response = await openRouterFetch(OPENROUTER_API, {
      method: "POST",
      headers: openRouterHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok || !response.body) {
      release();
      console.warn("LLM stream failed:", response.status);
      return null;
    }
    const wrappedBody = wrapStreamWithLlmRelease(response.body, release);
    return new Response(wrappedBody, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    release();
    console.warn("LLM stream error:", error);
    return null;
  }
}

export function buildUserMessageWithImage(
  messages: ChatHistoryMessage[],
  imageBase64?: string
): ChatMessage[] {
  const result: ChatMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "user" && imageBase64 && msg === messages[messages.length - 1]) {
      result.push({
        role: "user",
        content: [
          { type: "text", text: msg.content },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        ],
      });
    } else {
      result.push({ role: msg.role, content: msg.content });
    }
  }

  return result;
}
