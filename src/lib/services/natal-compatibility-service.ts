import { createHash, randomBytes, randomUUID } from "crypto";

import { query, queryClient, withTransaction } from "@/lib/db";
import { computeNatalChartRecord } from "@/lib/natal/compute";
import { sanitizeSynastryForClient, computeSynastry } from "@/lib/natal/synastry";
import type { CompatibilityEvidence, CompatibilityReport } from "@/lib/natal/compatibility-report";
import type { NatalChartInput, NatalChartRecord } from "@/lib/natal/types";
import { getOrComputeNatalChart } from "@/lib/services/natal-chart-service";
import { getUserById } from "@/lib/users";

export type CompatibilityMode = "manual" | "invite";
export type CompatibilityStatus = "pending" | "ready" | "completed" | "expired";

type CompatibilityRow = {
  id: string;
  owner_user_id: string;
  participant_user_id: string | null;
  canonical_report_id: string | null;
  mode: CompatibilityMode;
  status: CompatibilityStatus;
  owner_label: string;
  partner_label: string;
  synastry_snapshot: Record<string, unknown> | null;
  report_data: CompatibilityReport | null;
  evidence_refs: CompatibilityEvidence | null;
  rune_cost: number | null;
  charge_transaction_id: string | null;
  expires_at: string;
  claimed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CompatibilityRecord = {
  id: string;
  ownerUserId: string;
  participantUserId: string | null;
  mode: CompatibilityMode;
  status: CompatibilityStatus;
  ownerLabel: string;
  partnerLabel: string;
  synastry: ReturnType<typeof sanitizeSynastryForClient>;
  report: CompatibilityReport | null;
  evidence: CompatibilityEvidence | null;
  runeCost: number | null;
  chargeTransactionId: string | null;
  expiresAt: string;
  claimedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const SELECT_FIELDS = `id, owner_user_id, participant_user_id, mode, status,
  canonical_report_id, owner_label, partner_label, synastry_snapshot, report_data, evidence_refs,
  rune_cost, charge_transaction_id, expires_at, claimed_at, completed_at,
  created_at, updated_at`;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function tokenHash(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

function fingerprint(chart: NatalChartRecord): string {
  if (!chart.birthFingerprint) throw new Error("chart_fingerprint_missing");
  return hash(chart.birthFingerprint);
}

function pairFingerprint(a: string, b: string): string {
  return hash([a, b].sort().join(":"));
}

function cleanLabel(value: string | null | undefined, fallback: string): string {
  const label = value?.trim().replace(/\s+/g, " ").slice(0, 80);
  return label || fallback;
}

function mapRow(row: CompatibilityRow): CompatibilityRecord {
  const expired = row.status !== "completed" && new Date(row.expires_at).getTime() <= Date.now();
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    participantUserId: row.participant_user_id,
    mode: row.mode,
    status: expired ? "expired" : row.status,
    ownerLabel: row.owner_label,
    partnerLabel: row.partner_label,
    synastry: sanitizeSynastryForClient(row.synastry_snapshot),
    report: row.report_data,
    evidence: row.evidence_refs,
    runeCost: row.rune_cost,
    chargeTransactionId: row.charge_transaction_id,
    expiresAt: new Date(row.expires_at).toISOString(),
    claimedAt: row.claimed_at ? new Date(row.claimed_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function requireAccountChart(userId: string): Promise<NatalChartRecord> {
  const chart = await getOrComputeNatalChart(userId);
  if (!chart?.western || !chart.birthFingerprint) throw new Error("chart_unavailable");
  return chart;
}

function calculateSnapshot(
  ownerChart: NatalChartRecord,
  partnerChart: NatalChartRecord,
  labels: { owner: string; partner: string }
) {
  const calculated = computeSynastry(ownerChart, partnerChart, {
    a: labels.owner,
    b: labels.partner,
  });
  const sanitized = sanitizeSynastryForClient(calculated);
  if (!sanitized) throw new Error("synastry_unavailable");
  return sanitized;
}

export async function listCompatibilityRecords(userId: string): Promise<CompatibilityRecord[]> {
  await query(
    `UPDATE natal_compatibility_reports
     SET status = 'expired', generation_claim_token = NULL, generation_claim_at = NULL,
         updated_at = NOW()
     WHERE status <> 'completed' AND expires_at <= NOW()
       AND (owner_user_id = $1 OR participant_user_id = $1)`,
    [userId]
  );
  const { rows } = await query<CompatibilityRow>(
    `SELECT ${SELECT_FIELDS}
     FROM natal_compatibility_reports
     WHERE owner_user_id = $1 OR participant_user_id = $1
     ORDER BY created_at DESC LIMIT 100`,
    [userId]
  );
  return rows.map(mapRow);
}

export async function getCompatibilityRecord(
  id: string,
  userId: string
): Promise<CompatibilityRecord | null> {
  const { rows } = await query<CompatibilityRow>(
    `SELECT ${SELECT_FIELDS}
     FROM natal_compatibility_reports
     WHERE id = $1 AND (owner_user_id = $2 OR participant_user_id = $2)`,
    [id, userId]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.canonical_report_id) {
    return getCompatibilityRecord(row.canonical_report_id, userId);
  }
  return mapRow(row);
}

export async function createManualCompatibility(params: {
  ownerUserId: string;
  ownerLabel?: string | null;
  partnerLabel?: string | null;
  partnerInput: NatalChartInput;
}): Promise<{ record: CompatibilityRecord; reused: boolean }> {
  const ownerChart = await requireAccountChart(params.ownerUserId);
  const owner = await getUserById(params.ownerUserId);
  const ownerLabel = cleanLabel(params.ownerLabel, owner?.name ?? "Участник A");
  const partnerLabel = cleanLabel(params.partnerLabel, "Участник B");
  // This record is transient. Its raw input and resolved place are never passed
  // to SQL; only a one-way fingerprint and sanitized wheel evidence survive.
  const partnerChart = await computeNatalChartRecord(
    `manual-${randomUUID()}`,
    params.partnerInput
  );
  if (!partnerChart.western || !partnerChart.birthFingerprint) {
    throw new Error("partner_chart_unavailable");
  }
  const ownerFp = fingerprint(ownerChart);
  const partnerFp = fingerprint(partnerChart);
  const pairFp = pairFingerprint(ownerFp, partnerFp);
  const snapshot = calculateSnapshot(ownerChart, partnerChart, {
    owner: ownerLabel,
    partner: partnerLabel,
  });

  const { rows } = await query<CompatibilityRow>(
    `INSERT INTO natal_compatibility_reports (
       owner_user_id, mode, status, owner_label, partner_label,
       owner_fingerprint, partner_fingerprint, pair_fingerprint,
       synastry_snapshot, expires_at
     ) VALUES ($1, 'manual', 'ready', $2, $3, $4, $5, $6, $7::jsonb, NOW() + INTERVAL '30 days')
     ON CONFLICT DO NOTHING
     RETURNING ${SELECT_FIELDS}`,
    [
      params.ownerUserId,
      ownerLabel,
      partnerLabel,
      ownerFp,
      partnerFp,
      pairFp,
      JSON.stringify(snapshot),
    ]
  );
  if (rows[0]) return { record: mapRow(rows[0]), reused: false };
  const existing = await query<CompatibilityRow>(
    `SELECT ${SELECT_FIELDS} FROM natal_compatibility_reports
     WHERE owner_user_id = $1 AND pair_fingerprint = $2 AND status <> 'expired'
     ORDER BY created_at DESC LIMIT 1`,
    [params.ownerUserId, pairFp]
  );
  if (!existing.rows[0]) throw new Error("compatibility_create_conflict");
  return { record: mapRow(existing.rows[0]), reused: true };
}

export async function createCompatibilityInvite(params: {
  ownerUserId: string;
  ownerLabel?: string | null;
  partnerLabel?: string | null;
}): Promise<{ record: CompatibilityRecord; token: string }> {
  const ownerChart = await requireAccountChart(params.ownerUserId);
  const owner = await getUserById(params.ownerUserId);
  const ownerLabel = cleanLabel(params.ownerLabel, owner?.name ?? "Участник A");
  const partnerLabel = cleanLabel(params.partnerLabel, "Участник B");
  const token = randomBytes(32).toString("base64url");
  const { rows } = await query<CompatibilityRow>(
    `INSERT INTO natal_compatibility_reports (
       owner_user_id, mode, status, owner_label, partner_label,
       owner_fingerprint, invite_token_hash, invite_token_prefix, expires_at
     ) VALUES ($1, 'invite', 'pending', $2, $3, $4, $5, $6, NOW() + INTERVAL '7 days')
     RETURNING ${SELECT_FIELDS}`,
    [
      params.ownerUserId,
      ownerLabel,
      partnerLabel,
      fingerprint(ownerChart),
      tokenHash(token),
      token.slice(0, 8),
    ]
  );
  return { record: mapRow(rows[0]), token };
}

export async function getInviteStatus(
  token: string,
  viewerUserId: string
): Promise<CompatibilityRecord | null> {
  const { rows } = await query<CompatibilityRow>(
    `SELECT ${SELECT_FIELDS} FROM natal_compatibility_reports
     WHERE invite_token_hash = $1
       AND (owner_user_id = $2 OR participant_user_id IS NULL OR participant_user_id = $2)
     LIMIT 1`,
    [tokenHash(token), viewerUserId]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.canonical_report_id) {
    return getCompatibilityRecord(row.canonical_report_id, viewerUserId);
  }
  return mapRow(row);
}

export async function acceptCompatibilityInvite(params: {
  token: string;
  participantUserId: string;
  participantLabel?: string | null;
}): Promise<{ record: CompatibilityRecord; reused: boolean }> {
  const participantChart = await requireAccountChart(params.participantUserId);
  const participant = await getUserById(params.participantUserId);

  return withTransaction(async (client) => {
    const selected = await queryClient<
      CompatibilityRow & { owner_fingerprint: string }
    >(
      client,
      `SELECT ${SELECT_FIELDS}, owner_fingerprint
       FROM natal_compatibility_reports
       WHERE invite_token_hash = $1 FOR UPDATE`,
      [tokenHash(params.token)]
    );
    const invite = selected.rows[0];
    if (!invite) throw new Error("invite_not_found");
    if (invite.canonical_report_id) {
      const canonical = await queryClient<CompatibilityRow>(
        client,
        `SELECT ${SELECT_FIELDS} FROM natal_compatibility_reports
         WHERE id = $1 AND (owner_user_id = $2 OR participant_user_id = $2)`,
        [invite.canonical_report_id, params.participantUserId]
      );
      if (!canonical.rows[0]) throw new Error("invite_not_found");
      return { record: mapRow(canonical.rows[0]), reused: true };
    }
    if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
      await queryClient(
        client,
        `UPDATE natal_compatibility_reports SET status = 'expired', updated_at = NOW() WHERE id = $1`,
        [invite.id]
      );
      throw new Error("invite_expired");
    }
    if (invite.owner_user_id === params.participantUserId) {
      throw new Error("cannot_accept_own_invite");
    }
    if (invite.participant_user_id) {
      if (invite.participant_user_id !== params.participantUserId) {
        throw new Error("invite_already_claimed");
      }
      return { record: mapRow(invite), reused: true };
    }

    const ownerChart = await requireAccountChart(invite.owner_user_id);
    const ownerFp = fingerprint(ownerChart);
    if (ownerFp !== invite.owner_fingerprint) throw new Error("owner_chart_changed");
    const partnerFp = fingerprint(participantChart);
    const pairFp = pairFingerprint(ownerFp, partnerFp);
    const partnerLabel = cleanLabel(
      params.participantLabel,
      participant?.name ?? invite.partner_label
    );
    const duplicate = await queryClient<CompatibilityRow>(
      client,
      `SELECT ${SELECT_FIELDS} FROM natal_compatibility_reports
       WHERE owner_user_id = $1 AND pair_fingerprint = $2
         AND status <> 'expired' AND id <> $3
       ORDER BY created_at DESC LIMIT 1`,
      [invite.owner_user_id, pairFp, invite.id]
    );
    if (duplicate.rows[0]) {
      await queryClient(
        client,
        `UPDATE natal_compatibility_reports
         SET participant_user_id = $2, canonical_report_id = $3,
             status = 'expired', claimed_at = NOW(), expires_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [invite.id, params.participantUserId, duplicate.rows[0].id]
      );
      return { record: mapRow(duplicate.rows[0]), reused: true };
    }
    const snapshot = calculateSnapshot(ownerChart, participantChart, {
      owner: invite.owner_label,
      partner: partnerLabel,
    });
    const updated = await queryClient<CompatibilityRow>(
      client,
      `UPDATE natal_compatibility_reports
       SET participant_user_id = $2, partner_label = $3,
           partner_fingerprint = $4, pair_fingerprint = $5,
           synastry_snapshot = $6::jsonb, status = 'ready',
           claimed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND participant_user_id IS NULL
       RETURNING ${SELECT_FIELDS}`,
      [invite.id, params.participantUserId, partnerLabel, partnerFp, pairFp, JSON.stringify(snapshot)]
    );
    if (!updated.rows[0]) throw new Error("invite_claim_conflict");
    return { record: mapRow(updated.rows[0]), reused: false };
  });
}

export type CompatibilityGenerationClaim =
  | { status: "claimed"; token: string; record: CompatibilityRecord }
  | { status: "cached"; record: CompatibilityRecord }
  | { status: "busy" }
  | { status: "not_ready" }
  | { status: "not_found" };

export async function claimCompatibilityGeneration(
  id: string,
  ownerUserId: string
): Promise<CompatibilityGenerationClaim> {
  const token = randomUUID();
  const { rows } = await query<CompatibilityRow>(
    `UPDATE natal_compatibility_reports
     SET generation_claim_token = $3, generation_claim_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND owner_user_id = $2 AND status = 'ready'
       AND expires_at > NOW()
       AND (
         generation_claim_token IS NULL OR
         generation_claim_at < NOW() - INTERVAL '10 minutes'
       )
     RETURNING ${SELECT_FIELDS}`,
    [id, ownerUserId, token]
  );
  if (rows[0]) return { status: "claimed", token, record: mapRow(rows[0]) };

  const current = await getCompatibilityRecord(id, ownerUserId);
  if (!current || current.ownerUserId !== ownerUserId) return { status: "not_found" };
  if (current.status === "completed") return { status: "cached", record: current };
  if (current.status !== "ready") return { status: "not_ready" };
  return { status: "busy" };
}

/**
 * A paid report must describe the cards the user sees now, not an older
 * synastry snapshot. Manual partner data is deliberately not retained, so an
 * owner-chart change is still detected; invite records additionally verify
 * the participant's current chart.
 */
export async function compatibilityChartsAreCurrent(
  id: string,
  ownerUserId: string
): Promise<boolean> {
  const { rows } = await query<{
    owner_fingerprint: string;
    partner_fingerprint: string | null;
    participant_user_id: string | null;
  }>(
    `SELECT owner_fingerprint, partner_fingerprint, participant_user_id
     FROM natal_compatibility_reports
     WHERE id = $1 AND owner_user_id = $2`,
    [id, ownerUserId]
  );
  const record = rows[0];
  if (!record) return false;
  const owner = await requireAccountChart(ownerUserId);
  if (fingerprint(owner) !== record.owner_fingerprint) return false;
  if (!record.participant_user_id) return true;
  const participant = await requireAccountChart(record.participant_user_id);
  return fingerprint(participant) === record.partner_fingerprint;
}

export async function saveCompatibilityReport(params: {
  id: string;
  ownerUserId: string;
  claimToken: string;
  report: CompatibilityReport;
  evidence: CompatibilityEvidence;
  runeCost: number;
  chargeTransactionId?: string;
}): Promise<CompatibilityRecord | null> {
  const { rows } = await query<CompatibilityRow>(
    `UPDATE natal_compatibility_reports
     SET report_data = $4::jsonb, evidence_refs = $5::jsonb,
         rune_cost = $6, charge_transaction_id = $7,
         status = 'completed', completed_at = NOW(),
         generation_claim_token = NULL, generation_claim_at = NULL, updated_at = NOW()
     WHERE id = $1 AND owner_user_id = $2 AND status = 'ready'
       AND generation_claim_token = $3
     RETURNING ${SELECT_FIELDS}`,
    [
      params.id,
      params.ownerUserId,
      params.claimToken,
      JSON.stringify(params.report),
      JSON.stringify(params.evidence),
      params.runeCost,
      params.chargeTransactionId ?? null,
    ]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function releaseCompatibilityClaim(
  id: string,
  ownerUserId: string,
  claimToken: string
): Promise<void> {
  await query(
    `UPDATE natal_compatibility_reports
     SET generation_claim_token = NULL, generation_claim_at = NULL, updated_at = NOW()
     WHERE id = $1 AND owner_user_id = $2 AND generation_claim_token = $3`,
    [id, ownerUserId, claimToken]
  );
}

export async function deleteCompatibilityRecord(
  id: string,
  ownerUserId: string
): Promise<boolean> {
  return withTransaction(async (client) => {
    await queryClient(
      client,
      `UPDATE private_report_shares
       SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE report_kind = 'compatibility' AND report_id = $1`,
      [id]
    );
    const deleted = await queryClient(
      client,
      `DELETE FROM natal_compatibility_reports WHERE id = $1 AND owner_user_id = $2`,
      [id, ownerUserId]
    );
    return deleted.rowCount === 1;
  });
}
