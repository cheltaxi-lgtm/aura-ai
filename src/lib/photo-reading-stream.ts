import { createChatResponseStream } from "@/lib/chat-stream";
import { photoReadingFallback } from "@/lib/photo-reading-prompts";

export async function createPhotoInterpretationStream(params: {
  systemPrompt: string;
  spreadSummary: string;
  question?: string;
  userName: string;
  onComplete: (meta: { reply: string; llmFailed: boolean }) => Promise<Record<string, unknown>>;
}): Promise<Response | null> {
  const questionLine = params.question?.trim()
    ? `Вопрос: «${params.question.trim()}»`
    : "";

  const userBlock = [params.spreadSummary, questionLine, "Дай персональную расшифровку."]
    .filter(Boolean)
    .join("\n\n");

  return createChatResponseStream({
    systemPrompt: params.systemPrompt,
    messages: [{ role: "user", content: userBlock }],
    temperature: 0.65,
    onComplete: async (meta) => {
      const llmFailed = meta.llmFailed || !meta.reply.trim();
      const reply = llmFailed ? photoReadingFallback(params.userName) : meta.reply;
      const extras = await params.onComplete({ reply, llmFailed });
      return { ...extras, reply, llmFailed };
    },
  });
}
