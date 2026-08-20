import { NextRequest, NextResponse } from "next/server";

import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { isMatrixSubjectKind } from "@/lib/services/matrix-subject-service";
import { persistOwnedMatrixSnapshot } from "@/lib/services/matrix-snapshot-persist";

export const runtime = "nodejs";

/** Authenticated Matrix: persist immutable snapshot immediately, before any AI report. */
export async function POST(request: NextRequest) {
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const limited = await enforcePaidRouteRateLimit(
    auth.profileUserId,
    "numerology_matrix_report"
  );
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const birthDate = typeof body.birthDate === "string" ? body.birthDate : "";
  const displayName = typeof body.displayName === "string" ? body.displayName : null;
  const subjectKind =
    typeof body.subjectKind === "string" && isMatrixSubjectKind(body.subjectKind)
      ? body.subjectKind
      : "self";
  const subjectId = typeof body.subjectId === "string" ? body.subjectId : null;

  try {
    const persisted = await persistOwnedMatrixSnapshot({
      userId: auth.profileUserId,
      birthDate,
      displayName,
      subjectKind,
      subjectId,
    });
    return NextResponse.json({
      ok: true,
      subjectId: persisted.subjectId,
      birthDate: persisted.birthDate,
      asOfDate: persisted.asOfDate,
      calculationVersion: persisted.calculationVersion,
    });
  } catch (err) {
    const code =
      typeof err === "object" && err && "code" in err ? String((err as { code: string }).code) : "";
    if (code === "invalid_birth_date") {
      return NextResponse.json({ error: "invalid_birth_date" }, { status: 400 });
    }
    if (code === "matrix_subject_forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (code === "subject_limit") {
      return NextResponse.json({ error: "subject_limit" }, { status: 409 });
    }
    console.warn("[matrix-snapshot] persist failed");
    return NextResponse.json({ error: "persist_failed" }, { status: 500 });
  }
}
