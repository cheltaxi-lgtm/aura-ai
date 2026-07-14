import { buildNatalPromptBlock } from "@/lib/natal/format-prompt";
import { isNatalChartEnabled } from "@/lib/settings";
import { getOrComputeNatalChart } from "@/lib/services/natal-chart-service";

export async function buildNatalPromptContext(params: {
  profileUserId?: string | null;
  characterId: string;
}): Promise<string> {
  if (params.characterId !== "shri-raj") return "";
  if (!params.profileUserId) return "";
  if (!(await isNatalChartEnabled())) return "";

  try {
    const chart = await getOrComputeNatalChart(params.profileUserId);
    return buildNatalPromptBlock(chart);
  } catch (error) {
    console.warn("[natal-chart] prompt context failed:", error);
    return "";
  }
}
