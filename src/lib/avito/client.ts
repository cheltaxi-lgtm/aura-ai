import { isAvitoConfigured } from "./config";

const AVITO_API = "https://api.avito.ru";

// client_credentials tokens live 24h; the process is long-running (systemd), so
// an in-memory cache is enough — a restart simply fetches a fresh token.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function fetchToken(): Promise<string> {
  const clientId = process.env.AVITO_CLIENT_ID;
  const clientSecret = process.env.AVITO_CLIENT_SECRET;
  if (!isAvitoConfigured() || !clientId || !clientSecret) {
    throw new Error("avito_not_configured");
  }
  const res = await fetch(`${AVITO_API}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`avito_token_error_${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  // 5 min margin so a token never expires mid-request.
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, data.expires_in - 300) * 1000,
  };
  return data.access_token;
}

export async function getAvitoToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }
  return fetchToken();
}

export class AvitoApiError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`avito_api_error_${status}: ${body.slice(0, 300)}`);
    this.status = status;
  }
}

async function avitoFetch<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = await getAvitoToken();
  const res = await fetch(`${AVITO_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401 && !retried) {
    await getAvitoToken(true);
    return avitoFetch<T>(path, init, true);
  }
  if (!res.ok) {
    throw new AvitoApiError(res.status, await res.text());
  }
  return res.json() as Promise<T>;
}

export interface AvitoSelf {
  id: number;
  name: string;
  email?: string;
}

export interface AvitoChatUser {
  user_id: number;
  name?: string;
}

export interface AvitoChatListItem {
  id: string;
  chat_type?: string;
  created?: number;
  updated?: number;
  last_message?: {
    id?: string;
    author_id?: number;
    direction?: "in" | "out";
    type?: string;
    created?: number;
    content?: { text?: string };
  };
  users?: AvitoChatUser[];
  context?: {
    type?: string;
    value?: { id?: number; title?: string; url?: string; price_string?: string };
  };
}

export interface AvitoMessageItem {
  id: string;
  author_id?: number;
  direction?: "in" | "out";
  type?: string;
  created?: number;
  content?: { text?: string };
  isRead?: boolean;
}

export function getSelf(): Promise<AvitoSelf> {
  return avitoFetch<AvitoSelf>("/core/v1/accounts/self");
}

export function getChats(
  userId: number,
  params: { limit?: number; offset?: number; unreadOnly?: boolean } = {}
): Promise<{ chats?: AvitoChatListItem[] }> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params.limit ?? 50));
  qs.set("offset", String(params.offset ?? 0));
  if (params.unreadOnly) qs.set("unread_only", "true");
  return avitoFetch(`/messenger/v2/accounts/${userId}/chats?${qs}`);
}

export function getChatMessages(
  userId: number,
  chatId: string,
  params: { limit?: number; offset?: number } = {}
): Promise<{ messages?: AvitoMessageItem[] }> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params.limit ?? 100));
  qs.set("offset", String(params.offset ?? 0));
  return avitoFetch(`/messenger/v1/accounts/${userId}/chats/${chatId}/messages/?${qs}`);
}

export function sendTextMessage(
  userId: number,
  chatId: string,
  text: string
): Promise<{ id: string; created: number; type?: string; direction?: string }> {
  return avitoFetch(`/messenger/v1/accounts/${userId}/chats/${chatId}/messages`, {
    method: "POST",
    body: JSON.stringify({ type: "text", message: { text } }),
  });
}

export function markChatRead(userId: number, chatId: string): Promise<{ ok?: boolean }> {
  return avitoFetch(`/messenger/v1/accounts/${userId}/chats/${chatId}/read`, {
    method: "POST",
    body: "{}",
  });
}

export function subscribeWebhook(url: string): Promise<{ ok?: boolean }> {
  return avitoFetch("/messenger/v1/webhook", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export function unsubscribeWebhook(url: string): Promise<{ ok?: boolean }> {
  return avitoFetch("/messenger/v1/webhook/unsubscribe", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export function getSubscriptions(): Promise<{
  subscriptions?: Array<{ url: string; version?: string }>;
}> {
  return avitoFetch("/messenger/v1/subscriptions");
}
