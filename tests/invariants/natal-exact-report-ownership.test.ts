/**
 * P2.5A: Natal full-report ownership is exact current artifact, not any history row.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, recordAccountLegalConsent } from "@/lib/accounts";
import { query } from "@/lib/db";
import { natalInterpretationOwnsCurrentChart } from "@/lib/natal/presentation";
import { hasOwnedNatalInterpretationForArtifact } from "@/lib/natal/interpretation-ownership";
import {
  claimGuestNatalChart,
  createGuestNatalChart,
  getGuestNatalArtifactMeta,
} from "@/lib/services/natal-guest-service";
import { ensureMinimalConsumerProfile } from "@/lib/users";
import { hasTestDb, installDbLifecycle } from "./db/setup";

const ROOT = path.resolve(__dirname, "../..");

const MOSCOW = {
  label: "Moscow, Moscow, Russia",
  latitude: 55.7558,
  longitude: 37.6173,
  timezone: "Europe/Moscow",
};

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function report(opts: {
  fingerprint: string;
  engine: string;
  reportType?: string;
  content?: string;
}) {
  return {
    birthFingerprint: opts.fingerprint,
    engineVersion: opts.engine,
    reportType: opts.reportType ?? "interpretation",
    content: opts.content ?? "полный разбор",
  };
}

async function ensureNatalEnabled() {
  await query(
    `INSERT INTO platform_settings (key, value, updated_at)
     VALUES ('natalChart', '{"enabled":true,"ephemeris":"celestine"}'::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = COALESCE(platform_settings.value, '{}'::jsonb) ||
       '{"enabled":true}'::jsonb,
       updated_at = NOW()`
  );
}

async function insertInterpretation(opts: {
  userId: string;
  birthFingerprint: string;
  engineVersion: string;
  tradition?: "western" | "vedic";
  reportType?: string;
  content?: string;
  ephemeris?: string;
}) {
  await query(
    `INSERT INTO natal_report_history (
       user_id, birth_fingerprint, engine_version, ephemeris, tradition,
       report_type, content
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      opts.userId,
      opts.birthFingerprint,
      opts.engineVersion,
      opts.ephemeris ?? "celestine",
      opts.tradition ?? "western",
      opts.reportType ?? "interpretation",
      opts.content ?? "полный купленный разбор натальной карты",
    ]
  );
}

describe("natal-exact-report-ownership", () => {
  it("A: matching chart + interpretation → owned", () => {
    expect(
      natalInterpretationOwnsCurrentChart(
        [report({ fingerprint: "fp-a", engine: "v1" })],
        { birthFingerprint: "fp-a", engineVersion: "v1" }
      )
    ).toBe(true);
  });

  it("B: interpretation for another chart → not owned", () => {
    expect(
      natalInterpretationOwnsCurrentChart(
        [report({ fingerprint: "fp-b", engine: "v1" })],
        { birthFingerprint: "fp-a", engineVersion: "v1" }
      )
    ).toBe(false);
  });

  it("C: several reports — only the matching chart wins", () => {
    const reports = [
      report({ fingerprint: "fp-b", engine: "v1" }),
      report({ fingerprint: "fp-a", engine: "v1" }),
      report({ fingerprint: "fp-c", engine: "v1" }),
    ];
    expect(
      natalInterpretationOwnsCurrentChart(reports, {
        birthFingerprint: "fp-a",
        engineVersion: "v1",
      })
    ).toBe(true);
    expect(
      natalInterpretationOwnsCurrentChart(reports, {
        birthFingerprint: "fp-missing",
        engineVersion: "v1",
      })
    ).toBe(false);
    expect(
      natalInterpretationOwnsCurrentChart(
        [
          report({ fingerprint: "fp-a", engine: "v0" }),
          report({
            fingerprint: "fp-a",
            engine: "v1",
            reportType: "forecast:month:now",
          }),
        ],
        { birthFingerprint: "fp-a", engineVersion: "v1" }
      )
    ).toBe(false);
  });

  it("does not treat any history interpretation as current-chart ownership", () => {
    const natal = read("src/components/natal/NatalGuestCalculator.tsx");
    expect(natal).toMatch(
      /\/api\/natal-chart\/interpretation-owned\?artifactId=/
    );
    expect(natal).not.toMatch(/\/api\/natal-chart\/history\?limit=/);
    expect(natal).not.toMatch(
      /reportType === "interpretation" && Boolean\(String\(r\.content/
    );
  });

  it("owned CTA claims this artifact then opens cabinet; analytics stay non-PII", () => {
    const natal = read("src/components/natal/NatalGuestCalculator.tsx");
    expect(natal).toMatch(/freeToPaidFunnelState\(ownedNatal\)/);
    expect(natal).toMatch(/void runClaim\(false\)/);
    expect(natal).not.toMatch(/window\.location\.assign\("\/cabinet\/astrology"\)/);
    expect(natal).not.toMatch(
      /trackProductFunnel\([\s\S]{0,240}(birthFingerprint|chartId|birthDate)/
    );

    const route = read("src/app/api/natal-chart/interpretation-owned/route.ts");
    expect(route).toMatch(/requireProfileUserId/);
    expect(route).toMatch(/hasOwnedNatalInterpretationForArtifact/);
    expect(route).toMatch(/return NextResponse\.json\(\{ owned \}\)/);
    expect(route).not.toMatch(/birthFingerprint|birthDate/);
    expect(route).not.toMatch(/searchParams\.get\(["']chartId["']\)/);
  });
});

describe.skipIf(!hasTestDb)("natal-exact-report-ownership (db)", () => {
  installDbLifecycle();

  beforeEach(async () => {
    await query(`DELETE FROM natal_report_history`);
    await query(`DELETE FROM natal_guest_charts`);
    await query(`DELETE FROM natal_charts`);
  });

  it("A: paid interpretation for this artifact → owned", async () => {
    await ensureNatalEnabled();
    const { payload } = await createGuestNatalChart({
      birthDate: "1990-01-01",
      birthTime: "12:30",
      timeKnown: true,
      place: MOSCOW,
    });
    const account = await createUser(`natal-own-a-${Date.now()}@example.com`, "hash", "А");
    await recordAccountLegalConsent(account.id, { ageConfirmed: true, acceptedTerms: true });
    const user = await ensureMinimalConsumerProfile({ accountId: account.id, name: "А" });
    const meta = await getGuestNatalArtifactMeta(payload.artifactId);
    expect(meta).toBeTruthy();
    await insertInterpretation({
      userId: user.id,
      birthFingerprint: meta!.birthFingerprint,
      engineVersion: meta!.engineVersion,
    });

    expect(
      await hasOwnedNatalInterpretationForArtifact({
        userId: user.id,
        artifactId: payload.artifactId,
      })
    ).toBe(true);
  });

  it("B: paid interpretation for another chart → not owned", async () => {
    await ensureNatalEnabled();
    const { payload } = await createGuestNatalChart({
      birthDate: "1990-01-01",
      birthTime: "12:30",
      timeKnown: true,
      place: MOSCOW,
    });
    const account = await createUser(`natal-own-b-${Date.now()}@example.com`, "hash", "Б");
    await recordAccountLegalConsent(account.id, { ageConfirmed: true, acceptedTerms: true });
    const user = await ensureMinimalConsumerProfile({ accountId: account.id, name: "Б" });
    await insertInterpretation({
      userId: user.id,
      birthFingerprint: "other-chart-fingerprint",
      engineVersion: "natal-v1",
    });

    expect(
      await hasOwnedNatalInterpretationForArtifact({
        userId: user.id,
        artifactId: payload.artifactId,
      })
    ).toBe(false);
  });

  it("C: matching report is selected among several charts", async () => {
    await ensureNatalEnabled();
    const chartA = await createGuestNatalChart({
      birthDate: "1990-01-01",
      birthTime: "12:30",
      timeKnown: true,
      place: MOSCOW,
    });
    const chartB = await createGuestNatalChart({
      birthDate: "1985-06-15",
      birthTime: "08:15",
      timeKnown: true,
      place: MOSCOW,
    });
    const account = await createUser(`natal-own-c-${Date.now()}@example.com`, "hash", "В");
    await recordAccountLegalConsent(account.id, { ageConfirmed: true, acceptedTerms: true });
    const user = await ensureMinimalConsumerProfile({ accountId: account.id, name: "В" });
    const metaA = await getGuestNatalArtifactMeta(chartA.payload.artifactId);
    const metaB = await getGuestNatalArtifactMeta(chartB.payload.artifactId);
    await insertInterpretation({
      userId: user.id,
      birthFingerprint: metaB!.birthFingerprint,
      engineVersion: metaB!.engineVersion,
      tradition: "vedic",
    });
    await insertInterpretation({
      userId: user.id,
      birthFingerprint: metaA!.birthFingerprint,
      engineVersion: metaA!.engineVersion,
    });

    expect(
      await hasOwnedNatalInterpretationForArtifact({
        userId: user.id,
        artifactId: chartA.payload.artifactId,
      })
    ).toBe(true);
    expect(
      await hasOwnedNatalInterpretationForArtifact({
        userId: user.id,
        artifactId: chartB.payload.artifactId,
      })
    ).toBe(true);

    const chartC = await createGuestNatalChart({
      birthDate: "1970-12-31",
      birthTime: "01:00",
      timeKnown: true,
      place: MOSCOW,
    });
    expect(
      await hasOwnedNatalInterpretationForArtifact({
        userId: user.id,
        artifactId: chartC.payload.artifactId,
      })
    ).toBe(false);
  });

  it("D: guest claim keeps the same artifact identity for ownership", async () => {
    await ensureNatalEnabled();
    const { rawClaimToken, payload } = await createGuestNatalChart({
      birthDate: "1991-06-15",
      birthTime: "08:15",
      timeKnown: true,
      place: MOSCOW,
    });
    const before = await getGuestNatalArtifactMeta(payload.artifactId);
    const account = await createUser(`natal-own-d-${Date.now()}@example.com`, "hash", "Г");
    await recordAccountLegalConsent(account.id, { ageConfirmed: true, acceptedTerms: true });
    const user = await ensureMinimalConsumerProfile({ accountId: account.id, name: "Г" });

    const claim = await claimGuestNatalChart({
      profileUserId: user.id,
      rawClaimToken,
    });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;
    expect(claim.artifactId).toBe(payload.artifactId);
    expect(claim.birthFingerprint).toBe(before!.birthFingerprint);

    const after = await getGuestNatalArtifactMeta(payload.artifactId);
    expect(after!.claimedUserId).toBe(user.id);
    expect(after!.birthFingerprint).toBe(before!.birthFingerprint);
    expect(after!.engineVersion).toBe(before!.engineVersion);

    expect(
      await hasOwnedNatalInterpretationForArtifact({
        userId: user.id,
        artifactId: payload.artifactId,
      })
    ).toBe(false);

    await insertInterpretation({
      userId: user.id,
      birthFingerprint: after!.birthFingerprint,
      engineVersion: after!.engineVersion,
    });
    expect(
      await hasOwnedNatalInterpretationForArtifact({
        userId: user.id,
        artifactId: payload.artifactId,
      })
    ).toBe(true);
  });

  it("E: another user / missing artifact cannot read foreign ownership", async () => {
    await ensureNatalEnabled();
    const { payload } = await createGuestNatalChart({
      birthDate: "1992-03-03",
      birthTime: "09:00",
      timeKnown: true,
      place: MOSCOW,
    });
    const accountA = await createUser(`natal-own-e-a-${Date.now()}@example.com`, "hash", "А");
    await recordAccountLegalConsent(accountA.id, { ageConfirmed: true, acceptedTerms: true });
    const userA = await ensureMinimalConsumerProfile({ accountId: accountA.id, name: "А" });
    const accountB = await createUser(`natal-own-e-b-${Date.now()}@example.com`, "hash", "Б");
    await recordAccountLegalConsent(accountB.id, { ageConfirmed: true, acceptedTerms: true });
    const userB = await ensureMinimalConsumerProfile({ accountId: accountB.id, name: "Б" });

    const meta = await getGuestNatalArtifactMeta(payload.artifactId);
    await insertInterpretation({
      userId: userA.id,
      birthFingerprint: meta!.birthFingerprint,
      engineVersion: meta!.engineVersion,
    });

    expect(
      await hasOwnedNatalInterpretationForArtifact({
        userId: userB.id,
        artifactId: payload.artifactId,
      })
    ).toBe(false);

    await query(
      `UPDATE natal_guest_charts SET claimed_user_id = $2, claimed_at = NOW() WHERE id = $1`,
      [payload.artifactId, userA.id]
    );
    expect(
      await hasOwnedNatalInterpretationForArtifact({
        userId: userB.id,
        artifactId: payload.artifactId,
      })
    ).toBe(false);
    expect(
      await hasOwnedNatalInterpretationForArtifact({
        userId: userA.id,
        artifactId: payload.artifactId,
      })
    ).toBe(true);
    expect(
      await hasOwnedNatalInterpretationForArtifact({
        userId: userA.id,
        artifactId: "not-a-uuid",
      })
    ).toBe(false);
  });
});
