import { NextRequest, NextResponse } from "next/server";

import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { PRICING } from "@/lib/config/pricing";
import { purgeMatrixConsultationSessions } from "@/lib/numerology/matrix-session-cleanup";
import { requireProfileUserId } from "@/lib/require-auth";
import {
  deleteMatrixSubject,
  ensureSelfSubject,
  isMatrixSubjectKind,
  listMatrixSubjects,
  upsertMatrixSubject,
} from "@/lib/services/matrix-subject-service";

function subjectErrorResponse(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
  const status = code === "subject_limit" || code === "self_exists" ? 409 : 400;
  return NextResponse.json({ error: code || "invalid_subject" }, { status });
}

export async function GET() {
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = await enforcePaidRouteRateLimit(
    auth.profileUserId,
    "numerology_matrix_report"
  );
  if (limited) return limited;

  try {
    await ensureSelfSubject(auth.profileUserId);
    const subjects = await listMatrixSubjects(auth.profileUserId);
    return NextResponse.json({
      subjects,
      limit: PRICING.MATRIX_SUBJECT_LIMIT,
      costs: {
        self: PRICING.NUMEROLOGY_SESSION,
        subject: PRICING.MATRIX_SUBJECT_REPORT,
        child: PRICING.CHILD_MATRIX_REPORT,
      },
    });
  } catch (error) {
    console.warn("[numerology] matrix subjects list failed:", error);
    return NextResponse.json({ error: "Не удалось загрузить профили." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = await enforcePaidRouteRateLimit(
    auth.profileUserId,
    "numerology_matrix_report"
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.kind !== "string" || !isMatrixSubjectKind(body.kind)) {
    return NextResponse.json({ error: "invalid_subject_kind" }, { status: 400 });
  }
  if (typeof body.birthDate !== "string") {
    return NextResponse.json({ error: "invalid_birth_date" }, { status: 400 });
  }

  try {
    const subject = await upsertMatrixSubject({
      userId: auth.profileUserId,
      kind: body.kind,
      displayName: typeof body.displayName === "string" ? body.displayName : null,
      birthDate: body.birthDate,
      birthTime: typeof body.birthTime === "string" ? body.birthTime : null,
      birthCity: typeof body.birthCity === "string" ? body.birthCity : null,
    });
    return NextResponse.json({ subject }, { status: 201 });
  } catch (error) {
    return subjectErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = await enforcePaidRouteRateLimit(
    auth.profileUserId,
    "numerology_matrix_report_delete"
  );
  if (limited) return limited;

  const subjectId = request.nextUrl.searchParams.get("subjectId")?.trim();
  if (!subjectId) {
    return NextResponse.json({ error: "subjectId required" }, { status: 400 });
  }

  try {
    const result = await deleteMatrixSubject(auth.profileUserId, subjectId);
    const purgedSessions = result.deleted
      ? await purgeMatrixConsultationSessions(auth.profileUserId, result.sessionIds)
      : 0;
    return NextResponse.json({ ok: true, ...result, purgedSessions });
  } catch (error) {
    return subjectErrorResponse(error);
  }
}
