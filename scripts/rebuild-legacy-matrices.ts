/**
 * One-shot: regenerate every pre-v3 destiny/child/forecast matrix as matrix-v3.
 * Keeps the paid legacy row (overwrite: false) and does not charge runes.
 *
 * Usage (on the app host, with .env.local loaded):
 *   npx tsx scripts/rebuild-legacy-matrices.ts
 */
import { query } from "@/lib/db";
import {
  MATRIX_CALCULATION_VERSION,
  destinyMatrix,
  isLegacyMatrixCalculationVersion,
  matrixToStructuredData,
} from "@/lib/numerology/destiny-matrix";
import { forceFillMissingSections } from "@/lib/numerology/matrix-sectioned-reading";
import { purgeMatrixConsultationSessions } from "@/lib/numerology/matrix-session-cleanup";
import { isUsableMatrixReading, sanitizeReadingForClient } from "@/lib/chat-reply-sanitize";
import { resolveClientGender } from "@/lib/russian-name-gender";
import { createSession, updateSessionChatMeta } from "@/lib/session";
import { ensureSpreadReadingInChatMessages } from "@/lib/spread-reading-persist";
import {
  findOwnedMatrixReportBySubject,
  saveMatrixReport,
} from "@/lib/services/numerology-report-service";
import { generateNumerologSessionReading } from "@/lib/services/numerology-service";
import type { NumerologToolId } from "@/lib/numerology/tools";

type LegacyRow = {
  id: string;
  user_id: string;
  tool_id: string;
  subject_id: string | null;
  birth_date: string;
  calculation_version: string;
  rune_cost: number;
  session_id: string | null;
  user_name: string | null;
  gender: string | null;
  birth_time: string | null;
  birth_city: string | null;
  subject_name: string | null;
};

async function listLegacy(): Promise<LegacyRow[]> {
  const { rows } = await query<LegacyRow>(
    `SELECT r.id, r.user_id, r.tool_id, r.subject_id,
            r.birth_date::text AS birth_date,
            r.calculation_version, r.rune_cost, r.session_id,
            u.name AS user_name, u.gender, u.birth_time, u.birth_city,
            s.display_name AS subject_name
     FROM numerology_report_history r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN matrix_subjects s ON s.id = r.subject_id
     WHERE split_part(r.calculation_version, '@', 1) IN ('matrix-v1', 'matrix-v2')
       AND r.tool_id IN ('destiny_matrix', 'child_matrix', 'matrix_year_forecast')
     ORDER BY r.created_at ASC`
  );
  return rows;
}

async function rebuildOne(row: LegacyRow): Promise<string> {
  if (!isLegacyMatrixCalculationVersion(row.calculation_version)) {
    return "skip:not_legacy";
  }
  if (!row.subject_id) {
    return "skip:no_subject";
  }

  const toolId = row.tool_id as NumerologToolId;
  const existingV3 = await findOwnedMatrixReportBySubject(row.user_id, row.subject_id, {
    toolId,
  });
  if (
    existingV3 &&
    !isLegacyMatrixCalculationVersion(existingV3.calculationVersion) &&
    existingV3.content?.trim() &&
    isUsableMatrixReading(existingV3.content)
  ) {
    return `skip:already_v3:${existingV3.id}`;
  }

  const birthDate = row.birth_date.slice(0, 10);
  const userName =
    row.subject_name?.trim() || row.user_name?.trim() || "друг";

  // Drop the stale chat that still pairs with the old numbers.
  if (row.session_id?.trim()) {
    await purgeMatrixConsultationSessions(row.user_id, [row.session_id.trim()]);
  }

  const session = await createSession(undefined, row.user_id);
  await updateSessionChatMeta(session.id, {
    characterKey: "numerolog",
    intention: "destiny_matrix",
    spreadType: "new",
    spreadId: toolId === "child_matrix" ? "child_matrix" : "destiny_matrix",
    cards: [],
  });

  console.log(
    `[rebuild] start user=${row.user_id.slice(0, 8)} birth=${birthDate} from=${row.calculation_version}`
  );

  const sessionResult = await generateNumerologSessionReading({
    toolId,
    userName,
    birthDate,
    fullName: userName,
    gender: row.gender,
    spreadNumbers: [],
    birthTime: row.birth_time,
    birthCity: row.birth_city,
    userId: row.user_id,
    onMatrixProgress: (p) => {
      console.log(`[rebuild] ${p.done}/${p.total} ${p.label}`);
    },
  });

  const matrix = destinyMatrix(birthDate);
  let reading = sanitizeReadingForClient(sessionResult.reply?.trim() || "") || "";
  if (matrix && (!isUsableMatrixReading(reading) || !reading.trim())) {
    const gender = resolveClientGender(row.gender, userName);
    reading = forceFillMissingSections(reading || "", matrix, userName, gender);
    reading = sanitizeReadingForClient(reading) || reading;
  }
  if (!isUsableMatrixReading(reading) || !reading.trim()) {
    throw new Error(`empty_or_unusable_reading for ${row.id}`);
  }

  const { matrixReadingToStructuredPayload } = await import(
    "@/lib/numerology/matrix-reading-document"
  );
  const structuredBase = matrix
    ? matrixToStructuredData(matrix)
    : { version: MATRIX_CALCULATION_VERSION };

  const saved = await saveMatrixReport({
    userId: row.user_id,
    birthDateRaw: birthDate,
    content: reading,
    runeCost: 0,
    sessionId: session.id,
    structuredData: {
      ...structuredBase,
      ...(sessionResult.matrixDocument
        ? { reading: matrixReadingToStructuredPayload(sessionResult.matrixDocument) }
        : {}),
      rebuiltFrom: row.calculation_version,
      rebuiltFromReportId: row.id,
    },
    subjectId: row.subject_id,
    toolId,
    overwrite: false,
  });

  await ensureSpreadReadingInChatMessages({
    sessionId: session.id,
    profileUserId: row.user_id,
    characterId: "numerolog",
    reading: saved.report.content,
    tarotCards: [],
    intention: "destiny_matrix",
    spreadType: "new",
    spreadId: toolId === "child_matrix" ? "child_matrix" : "destiny_matrix",
    customQuestion: "Матрица судьбы",
  });

  return `${saved.status}:${saved.report.id}:v=${saved.report.calculationVersion}:len=${saved.report.content.length}`;
}

async function main() {
  console.log(`MATRIX_CALCULATION_VERSION=${MATRIX_CALCULATION_VERSION}`);
  const legacy = await listLegacy();
  console.log(`legacy_reports=${legacy.length}`);
  if (legacy.length === 0) {
    console.log("nothing to rebuild");
    return;
  }

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of legacy) {
    try {
      const result = await rebuildOne(row);
      if (result.startsWith("skip:")) {
        skipped += 1;
        console.log(`[skip] ${row.id} ${result}`);
      } else {
        ok += 1;
        console.log(`[ok] ${row.id} → ${result}`);
      }
    } catch (err) {
      failed += 1;
      console.error(`[fail] ${row.id}`, err);
    }
  }
  console.log(`done ok=${ok} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
