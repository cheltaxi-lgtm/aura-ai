import {
  buildNatalEvidence,
  formatEvidencePrompt,
  scopeNatalEvidence,
} from "@/lib/natal/evidence";
import { isNatalChartEnabled } from "@/lib/settings";
import { getOrComputeNatalChart } from "@/lib/services/natal-chart-service";
import { getNatalAiPreferences } from "@/lib/services/natal-ai-preferences-service";
import {
  isNatalContextEnabled,
  type NatalAiContextPurpose,
} from "@/lib/natal/ai-context-consent";

export async function buildNatalPromptContext(params: {
  profileUserId?: string | null;
  characterId: string;
  topic?: string | null;
  purpose: NatalAiContextPurpose;
}): Promise<string> {
  if (params.characterId !== "shri-raj") return "";
  if (!params.profileUserId) return "";
  if (!(await isNatalChartEnabled())) return "";

  try {
    const preferences = await getNatalAiPreferences(params.profileUserId);
    if (!isNatalContextEnabled(preferences, params.purpose)) return "";

    const chart = await getOrComputeNatalChart(params.profileUserId);
    if (!chart) return "";
    const scoped = scopeNatalEvidence(
      buildNatalEvidence(chart),
      params.topic?.trim() ?? "",
      params.purpose === "tarot" ? 8 : 12
    );
    if (!scoped.length) return "";
    return `=== РЕЛЕВАНТНЫЙ КОНТЕКСТ НАТАЛЬНОЙ КАРТЫ ===
Используй только перечисленные рассчитанные evidence. Не придумывай ID и не делай выводов вне них.
${formatEvidencePrompt(scoped)}
Заверши ответ дословным заголовком «Контекст карты использован» и отдельной строкой «Evidence: ${scoped.slice(0, 5).map((item) => item.id).join(", ")}». Не добавляй другие ID. Координаты рождения в контекст не переданы.`;
  } catch (error) {
    console.warn("[natal-chart] prompt context failed:", error);
    return "";
  }
}
