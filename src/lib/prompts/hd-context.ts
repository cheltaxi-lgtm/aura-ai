import { isHumanDesignEnabled } from "@/lib/settings";
import { listHdChartsForUser } from "@/lib/services/human-design-service";
import { formatHdChatSummary } from "@/lib/human-design/prompt";

/**
 * Human Design block for master chats. Injected only for Эвелина (numerolog) —
 * the master who owns the HD product — and only when the user has a chart.
 */
export async function buildHdPromptContext(params: {
  profileUserId?: string | null;
  characterId: string;
}): Promise<string> {
  if (params.characterId !== "numerolog") return "";
  if (!params.profileUserId) return "";
  if (!(await isHumanDesignEnabled())) return "";

  try {
    const charts = await listHdChartsForUser(params.profileUserId);
    const latest = charts[0];
    if (!latest) return "";
    return `=== ДИЗАЙН ЧЕЛОВЕКА КЛИЕНТА (рассчитано) ===
${formatHdChatSummary(latest.chart)}
Это точные рассчитанные данные карты клиента — используй их, когда отвечаешь о предназначении, энергии, решениях и отношениях. Не выдумывай ворота и линии вне этого блока.`;
  } catch (error) {
    console.warn("[human-design] prompt context failed:", error);
    return "";
  }
}
