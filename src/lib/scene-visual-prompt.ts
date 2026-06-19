import { completeChat } from "@/lib/llm";

function cleanText(text?: string, max = 600): string {
  if (!text?.trim()) return "";
  const clean = text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/**
 * Turns user question + master answer into a concrete image prompt (English).
 * Avoids generic tarot/mystic abstractions — focuses on the actual subject matter.
 */
export async function distillSceneVisualPrompt(
  userQuestion?: string,
  masterAnswer?: string
): Promise<string | null> {
  const question = cleanText(userQuestion, 400);
  const answer = cleanText(masterAnswer, 700);
  if (!answer) return null;

  const distilled = await completeChat({
    messages: [
      {
        role: "system",
        content: `You write image-generation prompts for a spiritual advisor chat app.
Your job: visualize the CONCRETE situation from the user's question and the master's answer.

Rules:
- Depict real subjects: people, relationships, workplaces, homes, nature, objects, actions, emotions, outcomes mentioned in the texts.
- Cinematic illustration or semi-realistic digital art — NOT generic tarot art.
- Do NOT add tarot cards, crystal balls, zodiac wheels, moon phases, or cosmic abstractions unless the texts explicitly mention them.
- No readable text, letters, captions, or watermarks in the image.
- Output ONLY the English image prompt, 60–100 words, no quotes or preamble.`,
      },
      {
        role: "user",
        content: question
          ? `User question (Russian):\n${question}\n\nMaster answer (Russian):\n${answer}`
          : `Master answer (Russian):\n${answer}`,
      },
    ],
    maxTokens: 180,
    temperature: 0.35,
  });

  const prompt = distilled?.replace(/^["'`]+|["'`]+$/g, "").trim();
  return prompt && prompt.length > 20 ? prompt : null;
}
