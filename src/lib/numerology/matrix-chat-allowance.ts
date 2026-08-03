import { PRICING } from "@/lib/config/pricing";
import { decodeNumerologSpreadId } from "@/lib/numerology/tools";
import {
  MATRIX_REPORT_TOOL_ID,
  userOwnsMatrixReport,
  userOwnsMatrixReportForSubject,
} from "@/lib/services/numerology-report-service";
import { getMatrixSubject } from "@/lib/services/matrix-subject-service";

/**
 * For paid Full Matrix owners chatting in a destiny_matrix session:
 * raise free-question allowance to MATRIX_INCLUDED_QUESTIONS (no full unlock).
 *
 * Ownership is scoped to the session's matrix subject — not the account profile.
 * Otherwise buying a child's matrix would unlock free questions on the parent's
 * own matrix chat (and vice versa).
 */
export async function resolveMatrixAwareFreeQuestionLimit(input: {
  baseLimit: number;
  profileUserId: string | null | undefined;
  birthDate: string | null | undefined;
  spreadId?: string | null | undefined;
  /** Fallback when session.spread_id is not patched yet (request body). */
  requestSpreadId?: string | null | undefined;
  toolId?: string | null | undefined;
  /** Session numerolog_tool_params (matrix subject the chat is about). */
  numerologToolParams?: {
    matrixSubjectId?: string | null;
    matrixBirthDate?: string | null;
  } | null;
}): Promise<number> {
  const base = Math.max(0, input.baseLimit);
  const toolId =
    (input.toolId === MATRIX_REPORT_TOOL_ID ? MATRIX_REPORT_TOOL_ID : null) ??
    decodeNumerologSpreadId(input.spreadId) ??
    decodeNumerologSpreadId(input.requestSpreadId);
  if (toolId !== MATRIX_REPORT_TOOL_ID) return base;
  if (!input.profileUserId) return base;

  try {
    const subjectId = input.numerologToolParams?.matrixSubjectId?.trim();
    if (subjectId) {
      const owned = await userOwnsMatrixReportForSubject(input.profileUserId, subjectId);
      return owned ? Math.max(base, PRICING.MATRIX_INCLUDED_QUESTIONS) : base;
    }
    const subjectBirth = input.numerologToolParams?.matrixBirthDate?.trim();
    const birthDate = subjectBirth || input.birthDate;
    if (!birthDate) return base;
    const owned = await userOwnsMatrixReport(input.profileUserId, birthDate);
    if (!owned) return base;
    return Math.max(base, PRICING.MATRIX_INCLUDED_QUESTIONS);
  } catch {
    return base;
  }
}

/** Birth date the matrix session is actually about (subject first, profile fallback). */
export async function resolveMatrixSessionBirthDate(input: {
  profileUserId: string | null | undefined;
  profileBirthDate: string | null | undefined;
  numerologToolParams?: {
    matrixSubjectId?: string | null;
    matrixBirthDate?: string | null;
  } | null;
}): Promise<string | null> {
  const direct = input.numerologToolParams?.matrixBirthDate?.trim();
  if (direct) return direct;
  const subjectId = input.numerologToolParams?.matrixSubjectId?.trim();
  if (subjectId && input.profileUserId) {
    try {
      const subject = await getMatrixSubject(input.profileUserId, subjectId);
      if (subject?.birthDate) return subject.birthDate;
    } catch {
      /* fall through to profile date */
    }
  }
  return input.profileBirthDate ?? null;
}
