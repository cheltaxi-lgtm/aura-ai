import { getSetting } from "./settings";
import { sanitizeChatHistory, type ChatHistoryMessage } from "./chat-sanitize";

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
  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
  };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    headers["HTTP-Referer"] = appUrl;
    headers["X-Title"] = "Aura";
  }
  return headers;
}

function resolveModel(
  vision: boolean,
  isPaid: boolean,
  aiSettings?: { model: string; visionModel: string; paidModel?: string; freeModel?: string }
): string {
  if (aiSettings) {
    if (vision) return aiSettings.visionModel;
    const main = aiSettings.model;
    const paid = aiSettings.paidModel ?? main;
    if (isPaid) return paid;
    return aiSettings.freeModel ?? paid ?? main;
  }
  if (vision) {
    return process.env.OPENROUTER_VISION_MODEL ?? "google/gemini-2.0-flash-001";
  }
  if (isPaid) {
    return process.env.OPENROUTER_PAID_MODEL ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
  }
  return process.env.OPENROUTER_FREE_MODEL ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
}

/** OpenRouter catalog IDs always contain a slash (e.g. deepseek/deepseek-chat-v3-0324). */
export function isOpenRouterModelId(model: string): boolean {
  return model.includes("/");
}

function defaultModel(vision = false, aiSettings?: { model: string; visionModel: string; paidModel?: string; freeModel?: string }, isPaid = false): string {
  return resolveModel(vision, isPaid, aiSettings);
}

async function resolveAiSettings() {
  try {
    return await getSetting("ai");
  } catch {
    return null;
  }
}

const RETRYABLE_STATUSES = new Set([429, 502, 503]);
const MAX_LLM_ATTEMPTS = 3;

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
    id.includes("deepseek-r1")
  );
}

function extractAssistantText(message: Record<string, unknown> | undefined): string | null {
  if (!message) return null;
  const content = typeof message.content === "string" ? message.content.trim() : "";
  if (content) return content;
  return null;
}

function openRouterRequestBody(
  base: Record<string, unknown>,
  model: string
): Record<string, unknown> {
  if (base.reasoning !== undefined) return base;
  if (!isReasoningCapableModel(String(model))) return base;
  return { ...base, reasoning: { effort: "none" } };
}

async function callChatCompletions(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeoutMs = 90000
): Promise<string | null> {
  const isOpenRouter = url.includes("openrouter.ai");
  const model = String(body.model ?? "");
  const payload = isOpenRouter ? openRouterRequestBody(body, model) : body;

  for (let attempt = 0; attempt < MAX_LLM_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_LLM_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, retryDelayMs(attempt)));
          continue;
        }
        console.warn("LLM request failed:", url, response.status, errText);
        return null;
      }
      const data = await response.json();
      const text = extractAssistantText(data.choices?.[0]?.message);
      if (text) return text;
      console.warn("LLM empty content:", model, JSON.stringify(data.choices?.[0]?.message)?.slice(0, 200));
      return null;
    } catch (error) {
      if (attempt < MAX_LLM_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, retryDelayMs(attempt)));
        continue;
      }
      console.warn("LLM request error:", error);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export async function completeChat(params: {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  vision?: boolean;
  isPaid?: boolean;
}): Promise<string | null> {
  const { messages, maxTokens, temperature = 0.85, vision = false, isPaid = false } = params;
  const aiSettings = await resolveAiSettings();
  const effectiveMaxTokens = maxTokens ?? aiSettings?.maxTokens ?? 800;
  const effectiveTemp = temperature ?? aiSettings?.temperature ?? 0.85;
  const provider: string = aiSettings?.provider ?? "openrouter";

  const requestBody = (model: string) => ({
    model,
    messages,
    max_tokens: effectiveMaxTokens,
    temperature: effectiveTemp,
  });

  const primaryModel = defaultModel(vision, aiSettings ?? undefined, isPaid);
  const fallbackModel =
    aiSettings?.model ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

  if (isOpenRouterConfigured()) {
    const text = await callChatCompletions(
      OPENROUTER_API,
      openRouterHeaders(),
      requestBody(primaryModel)
    );
    if (text?.trim()) return text.trim();

    if (fallbackModel !== primaryModel && !vision) {
      const fallbackText = await callChatCompletions(
        OPENROUTER_API,
        openRouterHeaders(),
        requestBody(fallbackModel)
      );
      if (fallbackText?.trim()) return fallbackText.trim();
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if ((provider === "openai" || provider === "openrouter") && !isPlaceholder(openaiKey)) {
    const text = await callChatCompletions(
      "https://api.openai.com/v1/chat/completions",
      { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      {
        model: vision ? "gpt-4o" : "gpt-4o-mini",
        messages,
        max_tokens: effectiveMaxTokens,
        temperature: effectiveTemp,
      }
    );
    if (text) return text;
  }

  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (
    provider === "deepseek" &&
    !isPlaceholder(deepseekKey) &&
    !vision &&
    !isOpenRouterModelId(primaryModel)
  ) {
    return callChatCompletions(
      "https://api.deepseek.com/chat/completions",
      { Authorization: `Bearer ${deepseekKey}`, "Content-Type": "application/json" },
      {
        model: "deepseek-chat",
        messages,
        max_tokens: effectiveMaxTokens,
        temperature: effectiveTemp,
      }
    );
  }

  return null;
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
