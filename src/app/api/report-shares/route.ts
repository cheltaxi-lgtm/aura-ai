import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { enforcePaidRouteRateLimit, enforceShareCreateRateLimit } from "@/lib/api-guards";
import {
  allowedShareSections,
  sanitizeCompatibilityReportShare,
  sanitizeNatalReportShare,
  sanitizeRelationshipReportShare,
  type ShareReportKind,
} from "@/lib/natal/report-share";

export async function GET() {
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforcePaidRouteRateLimit(auth.profileUserId, "report_share_manage");
  if (limited) return limited;
  const { rows } = await query<{
    id: string; token_prefix: string; report_kind: ShareReportKind; report_id: string;
    selected_sections: string[]; expires_at: string; revoked_at: string | null; created_at: string;
  }>(
    `SELECT id, LEFT(token, 8) AS token_prefix, report_kind, report_id,
            selected_sections, expires_at, revoked_at, created_at
     FROM private_report_shares WHERE owner_user_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [auth.profileUserId]
  );
  return NextResponse.json({ shares: rows.map((row) => ({
    id: row.id, tokenPrefix: row.token_prefix, reportKind: row.report_kind, reportId: row.report_id,
    selectedSections: row.selected_sections, expiresAt: row.expires_at,
    revokedAt: row.revoked_at, createdAt: row.created_at,
  })) });
}

export async function POST(request: NextRequest) {
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforceShareCreateRateLimit(auth.profileUserId);
  if (limited) return limited;
  const body = await request.json().catch(() => null) as {
    reportKind?: ShareReportKind; reportId?: string; sections?: unknown; expiresInDays?: number;
    thirdPartyConsentAcknowledged?: boolean;
  } | null;
  if (!body || (
        body.reportKind !== "natal" &&
        body.reportKind !== "relationship" &&
        body.reportKind !== "compatibility"
      ) ||
      typeof body.reportId !== "string") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const sections = allowedShareSections(body.reportKind, body.sections);
  if (!sections.length) return NextResponse.json({ error: "select_sections" }, { status: 400 });
  if (body.reportKind === "compatibility" && body.thirdPartyConsentAcknowledged !== true) {
    return NextResponse.json({ error: "third_party_consent_required" }, { status: 400 });
  }
  const days = Number.isFinite(body.expiresInDays)
    ? Math.min(Math.max(Math.floor(body.expiresInDays ?? 7), 1), 90) : 7;
  let payload: Record<string, unknown>;
  if (body.reportKind === "natal") {
    const { rows } = await query<{
      id: string; structured_data: unknown; content: string; evidence_refs: unknown;
      tradition: string; report_type: string; engine_version: string; ephemeris: string; created_at: string;
    }>(
      `SELECT id, structured_data, content, evidence_refs, tradition, report_type,
              engine_version, ephemeris, created_at
       FROM natal_report_history WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [body.reportId, auth.profileUserId]
    );
    const report = rows[0];
    if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });
    payload = sanitizeNatalReportShare({
      structuredData: report.structured_data, content: report.content,
      evidenceRefs: report.evidence_refs, sections,
      meta: { tradition: report.tradition, reportType: report.report_type,
        engineVersion: report.engine_version, ephemeris: report.ephemeris, createdAt: report.created_at },
    });
  } else if (body.reportKind === "relationship") {
    const { rows } = await query<{
      id: string; synastry_data: unknown; combined_reading: string | null;
      initiator_name: string | null; partner_name: string | null; completed_at: string | null;
    }>(
      `SELECT id, synastry_data, combined_reading, initiator_name, partner_name, completed_at
       FROM joint_readings
       WHERE id = $1 AND status = 'completed'
         AND (initiator_user_id = $2 OR partner_user_id = $2) LIMIT 1`,
      [body.reportId, auth.profileUserId]
    );
    const report = rows[0];
    if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });
    payload = sanitizeRelationshipReportShare({
      synastry: report.synastry_data, combinedReading: report.combined_reading,
      labels: { a: report.initiator_name?.trim().slice(0, 40) || "Участник A",
        b: report.partner_name?.trim().slice(0, 40) || "Участник B" },
      sections, meta: { reportType: "relationship", completedAt: report.completed_at },
    });
  } else {
    const { rows } = await query<{
      id: string; report_data: unknown; evidence_refs: unknown; synastry_snapshot: unknown;
      owner_label: string; partner_label: string; completed_at: string | null;
    }>(
      `SELECT id, report_data, evidence_refs, synastry_snapshot,
              owner_label, partner_label, completed_at
       FROM natal_compatibility_reports
       WHERE id = $1 AND status = 'completed'
         AND owner_user_id = $2 LIMIT 1`,
      [body.reportId, auth.profileUserId]
    );
    const report = rows[0];
    if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });
    payload = sanitizeCompatibilityReportShare({
      report: report.report_data,
      evidence: report.evidence_refs,
      synastry: report.synastry_snapshot,
      labels: { a: report.owner_label, b: report.partner_label },
      sections,
      meta: { reportType: "compatibility", completedAt: report.completed_at },
    });
  }
  const token = randomBytes(32).toString("base64url");
  const { rows } = await query<{ id: string; expires_at: string }>(
    `INSERT INTO private_report_shares
       (owner_user_id, token, report_kind, report_id, selected_sections, public_payload, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW() + ($7 || ' days')::interval)
     RETURNING id, expires_at`,
    [auth.profileUserId, token, body.reportKind, body.reportId, sections, JSON.stringify(payload), days]
  );
  return NextResponse.json({
    share: { id: rows[0].id, token, expiresAt: rows[0].expires_at, url: `/reports/shared/${token}` },
  }, { status: 201 });
}
