import { PRICING } from "@/lib/config/pricing";
import { decodeNumerologSpreadId } from "@/lib/numerology/tools";
import {
  MATRIX_REPORT_TOOL_ID,
  userOwnsMatrixReport,
} from "@/lib/services/numerology-report-service";

/**
 * For paid Full Matrix owners chatting in a destiny_matrix session:
 * raise free-question allowance to MATRIX_INCLUDED_QUESTIONS (no full unlock).
 */
export async function resolveMatrixAwareFreeQuestionLimit(input: {
  baseLimit: number;
  profileUserId: string | null | undefined;
  birthDate: string | null | undefined;
  spreadId: string | null | undefined;
}): Promise<number> {
  const base = Math.max(0, input.baseLimit);
  const toolId = decodeNumerologSpreadId(input.spreadId);
  if (toolId !== MATRIX_REPORT_TOOL_ID) return base;
  if (!input.profileUserId || !input.birthDate) return base;

  try {
    const owned = await userOwnsMatrixReport(input.profileUserId, input.birthDate);
    if (!owned) return base;
    return Math.max(base, PRICING.MATRIX_INCLUDED_QUESTIONS);
  } catch {
    return base;
  }
}
