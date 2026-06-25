import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { sanitizeChatHistory, type ChatHistoryMessage } from "@/lib/chat-sanitize";
import { stripMemoryLeakFromReply } from "@/lib/chat-reply-sanitize";
import { buildUserMessageWithImage, isRejectedLlmOutput, streamChat, type ChatMessage } from "@/lib/llm";

export interface ChatStreamMeta {
  reply: string;
  llmFailed: boolean;
}

export async function createChatResponseStream(params: {
  systemPrompt: string;
  messages: { role: string; content: string }[];
  imageBase64?: string;
  temperature?: number;
  onComplete: (meta: ChatStreamMeta) => Promise<Record<string, unknown>>;
}): Promise<Response | null> {
  const safeHistory = sanitizeChatHistory(params.messages);
  if (!safeHistory.length) return null;

  const fullPrompt = await wrapSystemPrompt(params.systemPrompt);
  const chatMessages: ChatMessage[] = [
    { role: "system", content: fullPrompt },
    ...buildUserMessageWithImage(safeHistory, params.imageBase64),
  ];

  const upstream = await streamChat({
    messages: chatMessages,
    maxTokens: 1200,
    vision: Boolean(params.imageBase64),
    temperature: params.temperature,
  });

  if (!upstream?.body) return null;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let fullText = "";
  let upstreamFailed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";
      let streamAborted = false;

      try {
        while (true) {
          if (streamAborted) break;
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const json = JSON.parse(data) as {
                choices?: { delta?: { content?: string } }[];
              };
              const token = json.choices?.[0]?.delta?.content ?? "";
              if (token) {
                fullText += token;
                if (isRejectedLlmOutput(fullText)) {
                  upstreamFailed = true;
                  streamAborted = true;
                  try {
                    await reader.cancel();
                  } catch {
                    /* upstream may already be closed */
                  }
                  break;
                }
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ token })}\n\n`)
                );
              }
            } catch {
              /* skip malformed chunk */
            }
          }
        }
      } catch (err) {
        console.warn("Chat stream read error:", err);
        upstreamFailed = true;
      }

      const rawReply = fullText.trim();
      const reply =
        rawReply && isRejectedLlmOutput(rawReply)
          ? ""
          : stripMemoryLeakFromReply(rawReply);
      const llmFailed = upstreamFailed || !reply;

      let metaExtras: Record<string, unknown> = {};
      try {
        metaExtras = await params.onComplete({ reply, llmFailed });
      } catch (err) {
        console.error("[DB_CHAT_SAVE_FAILED] Stream onComplete error:", err);
      }

      const resolvedReply =
        typeof metaExtras.reply === "string" ? metaExtras.reply : reply;

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "done",
            ...metaExtras,
            reply: resolvedReply,
            llmFailed: llmFailed || !resolvedReply,
          })}\n\n`
        )
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/** Stream pre-built assistant text with typing effect (numerolog engine, etc.). */
export function createDeterministicTextStream(params: {
  reply: string;
  llmFailed?: boolean;
  onComplete: () => Promise<Record<string, unknown>>;
}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const text = params.reply;
      const chunkSize = 10;

      try {
        for (let i = 0; i < text.length; i += chunkSize) {
          const token = text.slice(i, i + chunkSize);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ token })}\n\n`)
          );
          await new Promise((r) => setTimeout(r, 14));
        }

        let metaExtras: Record<string, unknown> = {};
        try {
          metaExtras = await params.onComplete();
        } catch (err) {
          console.error("[DB_CHAT_SAVE_FAILED] Deterministic stream onComplete error:", err);
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "done",
              ...metaExtras,
              reply: text,
              llmFailed: params.llmFailed ?? false,
            })}\n\n`
          )
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        console.warn("Deterministic stream error:", err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export type { ChatHistoryMessage };
