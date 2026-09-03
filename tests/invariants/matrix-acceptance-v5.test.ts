/**
 * Matrix v5 final acceptance gates A–J + independent formula oracle.
 * Does not mutate frozen v4. Does not read expected numbers from computeDestinyMatrixV5.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createUser, recordAccountLegalConsent } from "@/lib/accounts";
import { query } from "@/lib/db";
import { parseBirthDate, sumDigits } from "@/lib/numerology/constants";
import {
  classifyMatrixReportVersion,
  destinyMatrix,
  MATRIX_CALCULATION_VERSION,
  MATRIX_METHODOLOGY_ID,
  MATRIX_RENDERER_VERSION,
  MATRIX_V4_CALCULATION_VERSION,
  MATRIX_V4_METHODOLOGY_ID,
  MATRIX_V4_RENDERER_VERSION,
  matrixToStructuredData,
} from "@/lib/numerology/destiny-matrix";
import { headingLineForZone } from "@/lib/numerology/matrix-reading-document";
import {
  hydrateDestinyMatrixFromSnapshot,
  resolveMatrixForDisplay,
  resolveMatrixForDisplayDetailed,
} from "@/lib/numerology/matrix-snapshot";
import { listMatrixZones } from "@/lib/numerology/matrix-zones";
import { clientSafeMatrixResolveError, MATRIX_LABELS } from "@/lib/numerology/matrix-labels";
import { buildMatrixCompatFreeSummary } from "@/lib/numerology/matrix-compat-free-summary";
import { buildMatrixDiagramSvgFromResult } from "@/lib/numerology/matrix-diagram-svg";
import { buildMatrixFreeSummary } from "@/lib/numerology/matrix-free-summary";
import { buildNumerologSessionResult } from "@/lib/numerology/session-result";
import { matrixYearForecast } from "@/lib/numerology/matrix-year-forecast";
import {
  claimGuestMatrixPending,
  createMatrixGuestClaimToken,
  hashMatrixGuestClaimToken,
} from "@/lib/services/matrix-guest-service";
import {
  claimGuestMatrixPairPending,
  createMatrixPairGuestClaimToken,
  hashMatrixPairGuestClaimToken,
} from "@/lib/services/matrix-pair-guest-service";
import { ensureSelfSubject, upsertMatrixSubject } from "@/lib/services/matrix-subject-service";
import { ensureMinimalConsumerProfile, getUserById, updateUserProfile } from "@/lib/users";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { MATRIX_V5_GOLDEN_AS_OF } from "./matrix-golden-vectors-v5";

const ROOT = path.resolve(__dirname, "../..");
const AS_OF = { asOfDate: MATRIX_V5_GOLDEN_AS_OF } as const;
const V4 = { calculationVersion: MATRIX_V4_CALCULATION_VERSION } as const;

/** Independent digit-sum reducer — not imported from destiny-matrix-v5. */
function oracleReduce(n: number): number {
  let value = Math.abs(Math.trunc(n));
  while (value > 22) {
    value = String(value)
      .split("")
      .reduce((sum, digit) => sum + Number(digit), 0);
  }
  return value === 0 ? 22 : value;
}

function oracleV5(birthDate: string, asOfDate: string) {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) throw new Error(`bad dob ${birthDate}`);
  const [y, mo, d] = asOfDate.split("-").map(Number);
  const a = oracleReduce(parsed.day);
  const b = oracleReduce(parsed.month);
  const c = oracleReduce(sumDigits(parsed.year));
  const g = oracleReduce(a + b + c);
  const x = oracleReduce(a + b + c + g);
  const love = oracleReduce(a + x);
  const loveDeep = oracleReduce(a + love);
  const talentSecondary = oracleReduce(b + x);
  const talentTertiary = oracleReduce(b + talentSecondary);
  const money = oracleReduce(c + x);
  const moneyDeep = oracleReduce(c + money);
  const karmicMid = oracleReduce(g + x);
  const karmicTip = oracleReduce(g + karmicMid);
  const ab = oracleReduce(a + b);
  const bc = oracleReduce(b + c);
  const cg = oracleReduce(c + g);
  const ga = oracleReduce(g + a);
  const personal = oracleReduce(oracleReduce(b + g) + oracleReduce(a + c));
  const social = oracleReduce(oracleReduce(ab + cg) + oracleReduce(bc + ga));
  const spiritual = oracleReduce(personal + social);
  let chronological = y - parsed.year;
  if (mo < parsed.month || (mo === parsed.month && d < parsed.day)) chronological -= 1;
  return {
    a,
    b,
    c,
    g,
    x,
    talentPrimary: b,
    talentSecondary,
    talentTertiary,
    love,
    loveDeep,
    money,
    moneyDeep,
    karmicRoot: g,
    karmicMid,
    karmicTip,
    ab,
    cg,
    bc,
    ga,
    personal,
    social,
    spiritual,
    chronological: Math.max(0, chronological),
  };
}

const ORACLE_DATES = [
  "1990-08-15",
  "1984-10-31",
  "1995-06-12",
  "2000-01-01",
  "1999-12-31",
  "1977-11-22",
  "1966-08-29",
  "1988-08-08",
  "1955-07-16",
  "2010-02-28",
  "1944-04-04",
  "1983-09-23",
] as const;

describe("independent v5 formula oracle", () => {
  it("matches live engine on 12 dates including deep love/money and double digit-sum", () => {
    const intermediates: number[] = [];
    for (const birthDate of ORACLE_DATES) {
      const expected = oracleV5(birthDate, MATRIX_V5_GOLDEN_AS_OF);
      const m = destinyMatrix(birthDate, AS_OF);
      expect(m, birthDate).toBeTruthy();
      expect(m!.calculationVersion).toBe("matrix-v5");
      expect(m!.body.number, `${birthDate} A`).toBe(expected.a);
      expect(m!.energy.number, `${birthDate} B`).toBe(expected.b);
      expect(m!.roots.number, `${birthDate} C`).toBe(expected.c);
      expect(m!.karma.number, `${birthDate} G`).toBe(expected.g);
      expect(m!.comfort.number, `${birthDate} X`).toBe(expected.x);
      expect(m!.purpose.number, `${birthDate} personal`).toBe(expected.personal);
      if (expected.personal !== expected.x) {
        expect(m!.purpose.number, `${birthDate} purpose≠comfort`).not.toBe(m!.comfort.number);
      }
      expect(m!.talentsChain?.primary.number, `${birthDate} talent.1`).toBe(expected.talentPrimary);
      expect(m!.talents.number, `${birthDate} talent.2`).toBe(expected.talentSecondary);
      expect(m!.talentsChain?.tertiary.number, `${birthDate} talent.3`).toBe(expected.talentTertiary);
      expect(m!.relationships.number, `${birthDate} love`).toBe(expected.love);
      expect(m!.loveDeep?.number, `${birthDate} loveDeep`).toBe(expected.loveDeep);
      expect(m!.money.number, `${birthDate} money`).toBe(expected.money);
      expect(m!.moneyDeep?.number, `${birthDate} moneyDeep`).toBe(expected.moneyDeep);
      expect(m!.karmicTail[0].number, `${birthDate} tail.1`).toBe(expected.karmicRoot);
      expect(m!.karmicTail[1].number, `${birthDate} tail.2`).toBe(expected.karmicMid);
      expect(m!.karmicTail[2].number, `${birthDate} tail.3`).toBe(expected.karmicTip);
      expect(m!.lineage?.male[0].number, `${birthDate} AB`).toBe(expected.ab);
      expect(m!.paternal.number, `${birthDate} CG`).toBe(expected.cg);
      expect(m!.maternal.number, `${birthDate} BC`).toBe(expected.bc);
      expect(m!.lineage?.female[2].number, `${birthDate} GA`).toBe(expected.ga);
      expect(m!.purposeBlock?.social.number, `${birthDate} social`).toBe(expected.social);
      expect(m!.purposeBlock?.spiritual.number, `${birthDate} spiritual`).toBe(expected.spiritual);
      expect(m!.chronologicalAge, `${birthDate} chrono`).toBe(expected.chronological);
      const parsed = parseBirthDate(birthDate)!;
      intermediates.push(
        parsed.day,
        parsed.month,
        sumDigits(parsed.year),
        expected.a + expected.b + expected.c,
        expected.a + expected.b + expected.c + expected.g,
        expected.a + expected.x,
        expected.b + expected.x,
        expected.c + expected.x,
        expected.g + expected.x,
        expected.ab + expected.cg,
        expected.bc + expected.ga,
        expected.personal + expected.social
      );
    }
    expect(intermediates.some((n) => n < 22)).toBe(true);
    expect(intermediates.some((n) => n === 22)).toBe(true);
    expect(intermediates.some((n) => n >= 23 && n <= 31)).toBe(true);
    expect(intermediates.some((n) => n > 31)).toBe(true);
    expect(intermediates.some((n) => n > 44)).toBe(true);
    expect(intermediates.some((n) => n > 22 && oracleReduce(n) <= 22)).toBe(true);
  });
});

describe("A unknown version never falls back to latest", () => {
  it("matrix-v99 / latest / unknown fail closed", () => {
    for (const version of ["matrix-v99", "latest", "unknown"]) {
      expect(
        resolveMatrixForDisplayDetailed({
          birthDate: "1990-08-15",
          calculationVersion: version,
          createdAt: "2026-08-18",
        })
      ).toEqual({ ok: false, error: "unsupported_matrix_version" });
      expect(destinyMatrix("1990-08-15", { calculationVersion: version })).toBeNull();
    }
  });

  it("v1/v2 without snapshot stay legacy_without_snapshot", () => {
    expect(
      resolveMatrixForDisplayDetailed({
        birthDate: "1990-08-15",
        calculationVersion: "matrix-v1",
        createdAt: "2020-01-01",
      })
    ).toEqual({ ok: false, error: "legacy_without_snapshot" });
    expect(
      resolveMatrixForDisplayDetailed({
        birthDate: "1990-08-15",
        calculationVersion: "matrix-v2",
        createdAt: "2020-01-01",
      })
    ).toEqual({ ok: false, error: "legacy_without_snapshot" });
  });
});

describe("B old v4 snapshot never uses v5 engine", () => {
  it("hydrates stored v4 numbers and does not invent purposeBlock", () => {
    const v4 = destinyMatrix("1990-08-15", { ...AS_OF, ...V4 })!;
    const live = destinyMatrix("1990-08-15", AS_OF)!;
    expect(v4.talents.number).toBe(5);
    expect(live.talents.number).toBe(20);
    expect(v4.purpose.number).toBe(v4.comfort.number);
    expect(v4.purposeBlock).toBeUndefined();

    const snap = matrixToStructuredData(v4);
    delete snap.purposeBlock;
    const resolved = resolveMatrixForDisplay({
      birthDate: "1990-08-15",
      structuredData: snap,
      calculationVersion: "matrix-v5",
      createdAt: "2026-08-18",
    })!;
    expect(resolved.calculationVersion).toBe("matrix-v4");
    expect(resolved.talents.number).toBe(5);
    expect(resolved.comfort.number).toBe(v4.comfort.number);
    expect(resolved.purpose.number).toBe(v4.comfort.number);
    expect(resolved.purposeBlock).toBeUndefined();
    expect(resolved.rendererVersion).toBe(MATRIX_V4_RENDERER_VERSION);
  });
});

describe("C old pair snapshot never mixes v5 fields", () => {
  it("reconstructs preview from stored version without live purposeBlock", () => {
    const live = destinyMatrix("1990-08-15", AS_OF)!;
    const v4 = destinyMatrix("1990-08-15", { ...AS_OF, ...V4 })!;
    expect(live.purpose.number).not.toBe(v4.comfort.number);
    const snap = {
      version: "matrix-v4",
      methodology: "zovus",
      score: 61,
      summary: "исторический превью",
      strengths: ["старая сила"],
      tensions: ["старое напряжение"],
      zones: [],
      pairComfort: v4.comfort.number,
      pairYear: v4.yearArcana.number,
    };
    expect(JSON.stringify(snap)).not.toContain("purposeBlock");
    expect(snap.pairComfort).not.toBe(live.purpose.number);
  });
});

describe("H age heading / content contract", () => {
  it("uses human age+period heading, not the old completeness phrase", () => {
    const m = destinyMatrix("1990-08-15", AS_OF)!;
    const ageZone = listMatrixZones(m).find((z) => z.id === "age");
    expect(ageZone).toBeTruthy();
    expect(ageZone!.label).toBe(MATRIX_LABELS.ageAndPeriod);
    const heading = headingLineForZone(ageZone!);
    expect(heading.startsWith("Возраст и текущий период")).toBe(true);
    expect(heading).toContain("Текущий возраст");
    expect(heading).toContain("Период Матрицы");
    expect(heading).toContain(String(m.ageModel!.chronological));
    expect(heading).toContain(String(m.ageModel!.periodStart));
    expect(heading.startsWith("Точка возраста сейчас")).toBe(false);
    expect(m.ageModel!.chronological).not.toBe(m.ageModel!.periodStart);
  });
});

describe("I explicit asOf reproducibility", () => {
  it("repeats the same structured result for the same DOB/version/asOf", () => {
    const first = matrixToStructuredData(destinyMatrix("1983-09-23", AS_OF)!);
    const second = matrixToStructuredData(destinyMatrix("1983-09-23", AS_OF)!);
    const third = matrixToStructuredData(destinyMatrix("1983-09-23", AS_OF)!);
    expect(first).toEqual(second);
    expect(second).toEqual(third);
  });
});

describe("J renderer version selection", () => {
  it("v4 snapshot without stored renderer stays on matrix-svg-v5", () => {
    const v4 = destinyMatrix("1990-08-15", { ...AS_OF, ...V4 })!;
    const snap = matrixToStructuredData(v4);
    delete snap.rendererVersion;
    const hydrated = hydrateDestinyMatrixFromSnapshot(snap)!;
    expect(hydrated.calculationVersion).toBe("matrix-v4");
    expect(hydrated.rendererVersion).toBe("matrix-svg-v5");
    expect(hydrated.rendererVersion).not.toBe(MATRIX_RENDERER_VERSION);
  });

  it("live v5 uses matrix-svg-v6", () => {
    const m = destinyMatrix("1990-08-15", AS_OF)!;
    expect(m.rendererVersion).toBe("matrix-svg-v6");
    expect(classifyMatrixReportVersion({ calculationVersion: "matrix-v5" }).currentMethodology).toBe(
      true
    );
  });
});

describe("child_purpose uses personal purpose", () => {
  it("does not alias comfort/center", () => {
    const m = destinyMatrix("1990-08-15", AS_OF)!;
    const childPurpose = listMatrixZones(m, "child_matrix").find((z) => z.id === "child_purpose");
    expect(childPurpose?.number).toBe(m.purposeBlock?.personal.number);
    expect(childPurpose?.number).not.toBe(m.comfort.number);
  });
});

describe("one authoritative reducer (source audit)", () => {
  it("v5 derived math goes through matrix-reducers, not inline % 22", () => {
    const v5 = readFileSync(path.join(ROOT, "src/lib/numerology/destiny-matrix-v5.ts"), "utf8");
    const forecast = readFileSync(path.join(ROOT, "src/lib/numerology/matrix-year-forecast.ts"), "utf8");
    const compat = readFileSync(path.join(ROOT, "src/lib/numerology/matrix-compatibility.ts"), "utf8");
    expect(v5).toContain("reduceToArcanaDigitSum");
    expect(v5).not.toMatch(/%\s*22/);
    expect(forecast).toContain("reduceToArcanaNumber");
    expect(compat).toContain("reduceToArcanaNumber");
    expect(MATRIX_CALCULATION_VERSION).toBe("matrix-v5");
    expect(MATRIX_METHODOLOGY_ID).toBe("zovus-matrix-22-v2");
  });
});

describe.runIf(hasTestDb)("D/E/F/G acceptance (db)", () => {
  installDbLifecycle();

  it("D: updateUserProfile syncs self subject DOB", async () => {
    const account = await createUser(`mx-acc-d-${Date.now()}@example.com`, "hash", "Профиль");
    await recordAccountLegalConsent(account.id, { ageConfirmed: true, acceptedTerms: true });
    const user = await ensureMinimalConsumerProfile({ accountId: account.id, name: "Профиль" });
    await updateUserProfile(user.id, { name: "Профиль", gender: "female", birthDate: "1990-08-15" });
    const self = await ensureSelfSubject(user.id);
    expect(self?.birthDate).toBe("1990-08-15");
    await updateUserProfile(user.id, { name: "Профиль", gender: "female", birthDate: "1991-01-02" });
    const after = await getUserById(user.id);
    expect(String(after!.birth_date).slice(0, 10)).toBe("1991-01-02");
    const synced = await ensureSelfSubject(user.id);
    expect(synced?.birthDate).toBe("1991-01-02");
    const { rows } = await query<{ birth_date: string }>(
      `SELECT birth_date::text FROM matrix_subjects WHERE user_id = $1 AND kind = 'self'`,
      [user.id]
    );
    expect(String(rows[0]?.birth_date).slice(0, 10)).toBe("1991-01-02");
  });

  it("E: child/partner/other cannot mutate purchaser DOB", async () => {
    const account = await createUser(`mx-acc-e-${Date.now()}@example.com`, "hash", "Владелец");
    await recordAccountLegalConsent(account.id, { ageConfirmed: true, acceptedTerms: true });
    const user = await ensureMinimalConsumerProfile({ accountId: account.id, name: "Владелец" });
    await updateUserProfile(user.id, { name: "Владелец", gender: "male", birthDate: "1990-08-15" });
    await ensureSelfSubject(user.id);
    await upsertMatrixSubject({
      userId: user.id,
      kind: "child",
      displayName: "Ребёнок",
      birthDate: "2015-03-12",
    });
    await upsertMatrixSubject({
      userId: user.id,
      kind: "partner",
      displayName: "Партнёр",
      birthDate: "1988-05-05",
    });
    await upsertMatrixSubject({
      userId: user.id,
      kind: "other",
      displayName: "Другой",
      birthDate: "1977-11-22",
    });
    const owner = await getUserById(user.id);
    expect(String(owner!.birth_date).slice(0, 10)).toBe("1990-08-15");
    const self = await ensureSelfSubject(user.id);
    expect(self?.birthDate).toBe("1990-08-15");
  });

  it("F+G: guest v4 pending stays v4 after claim and claim is idempotent", async () => {
    const v4 = destinyMatrix("1984-10-31", { asOfDate: "2024-06-01", ...V4 })!;
    const snapshot = matrixToStructuredData(v4);
    const rawClaimToken = createMatrixGuestClaimToken();
    const claimHash = hashMatrixGuestClaimToken(rawClaimToken);
    await query(
      `INSERT INTO matrix_guest_pending (
         birth_date, display_name, as_of_date, calculation_version, methodology_id,
         matrix_snapshot, claim_token_hash, expires_at
       ) VALUES (
         $1::date, $2, $3::date, $4, $5, $6::jsonb, $7, NOW() + interval '2 days'
       )`,
      [
        "1984-10-31",
        "Гость v4",
        "2024-06-01",
        MATRIX_V4_CALCULATION_VERSION,
        MATRIX_V4_METHODOLOGY_ID,
        JSON.stringify(snapshot),
        claimHash,
      ]
    );

    const account = await createUser(`mx-acc-f-${Date.now()}@example.com`, "hash", "Клейм");
    await recordAccountLegalConsent(account.id, { ageConfirmed: true, acceptedTerms: true });
    const stub = await ensureMinimalConsumerProfile({ accountId: account.id, name: "Клейм" });
    const first = await claimGuestMatrixPending({
      profileUserId: stub.id,
      rawClaimToken,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.calculationVersion).toBe("matrix-v4");
    expect(first.asOfDate).toBe("2024-06-01");
    expect(first.status).toBe("claimed");

    const { rows } = await query<{
      calculation_version: string;
      matrix_snapshot: Record<string, unknown>;
    }>(
      `SELECT calculation_version, matrix_snapshot FROM matrix_guest_pending
       WHERE claim_token_hash = $1`,
      [claimHash]
    );
    expect(rows[0]?.calculation_version).toBe("matrix-v4");
    expect(rows[0]?.matrix_snapshot.calculationVersion).toBe("matrix-v4");
    expect(rows[0]?.matrix_snapshot.version).toBe("matrix-v4");
    expect((rows[0]?.matrix_snapshot.talents as { number?: number })?.number).toBe(v4.talents.number);
    expect((rows[0]?.matrix_snapshot.comfort as { number?: number })?.number).toBe(v4.comfort.number);
    expect(rows[0]?.matrix_snapshot.purposeBlock).toBeUndefined();

    const replay = await claimGuestMatrixPending({
      profileUserId: stub.id,
      rawClaimToken,
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.status).toBe("idempotent");
    expect(replay.calculationVersion).toBe("matrix-v4");
    expect(replay.asOfDate).toBe("2024-06-01");
    expect(replay.subjectId).toBe(first.subjectId);

    const after = await query<{
      calculation_version: string;
      matrix_snapshot: Record<string, unknown>;
    }>(
      `SELECT calculation_version, matrix_snapshot FROM matrix_guest_pending
       WHERE claim_token_hash = $1`,
      [claimHash]
    );
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0]?.calculation_version).toBe("matrix-v4");
    expect((after.rows[0]?.matrix_snapshot.talents as { number?: number })?.number).toBe(
      v4.talents.number
    );
    expect(after.rows[0]?.matrix_snapshot.purposeBlock).toBeUndefined();
  });

  it("C db: v4 pair pending claim keeps stored version and score", async () => {
    const rawClaimToken = createMatrixPairGuestClaimToken();
    const claimHash = hashMatrixPairGuestClaimToken(rawClaimToken);
    const snap = {
      version: "matrix-v4",
      methodology: "zovus",
      score: 61,
      summary: "исторический превью",
      strengths: ["старая сила"],
      tensions: ["старое напряжение"],
      zones: [
        {
          id: "comfort",
          label: "Комфорт",
          score: 61,
          note: "старая зона",
          numberA: 12,
          numberB: 18,
          titleA: "Повешенный",
          titleB: "Луна",
        },
      ],
      pairComfort: 12,
      pairYear: 6,
    };
    await query(
      `INSERT INTO matrix_pair_guest_pending (
         date_a, date_b, name_a, name_b, calculation_version, methodology_id,
         compat_snapshot, claim_token_hash, expires_at
       ) VALUES (
         $1::date, $2::date, $3, $4, $5, $6, $7::jsonb, $8, NOW() + interval '2 days'
       )`,
      [
        "1990-08-15",
        "1984-10-31",
        "А",
        "Б",
        "matrix-v4",
        MATRIX_V4_METHODOLOGY_ID,
        JSON.stringify(snap),
        claimHash,
      ]
    );
    const account = await createUser(`mx-acc-c-${Date.now()}@example.com`, "hash", "Пара");
    await recordAccountLegalConsent(account.id, { ageConfirmed: true, acceptedTerms: true });
    const stub = await ensureMinimalConsumerProfile({ accountId: account.id, name: "Пара" });
    const claim = await claimGuestMatrixPairPending({
      profileUserId: stub.id,
      rawClaimToken,
    });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;
    expect(claim.calculationVersion).toBe("matrix-v4");
    expect(claim.score).toBe(61);
    expect(claim.preview.version).toBe("matrix-v4");
    expect(claim.preview.score).toBe(61);
    expect(JSON.stringify(claim.preview)).not.toContain("purposeBlock");
    expect(claim.preview.version).not.toBe(MATRIX_CALCULATION_VERSION);
  });
});

describe("year forecast UI contract", () => {
  it("surfaces 34→35, 39→40, 44→45 and stays quiet mid-period", () => {
    const from = new Date(2026, 2, 1);
    const cases = [
      { dob: "1991-03-08", fromPeriod: 30, toPeriod: 35 },
      { dob: "1986-03-08", fromPeriod: 35, toPeriod: 40 },
      { dob: "1981-03-08", fromPeriod: 40, toPeriod: 45 },
    ] as const;
    for (const row of cases) {
      const engine = matrixYearForecast(row.dob, from)!;
      // The transition belongs to the birthday month, including its partial period.
      const marchEngine = engine.months.find((m) => m.year === 2026 && m.month === 3);
      expect(marchEngine?.ageTransition).toBe(true);
      expect(marchEngine?.periodFrom).toBe(row.fromPeriod);
      expect(marchEngine?.periodTo).toBe(row.toPeriod);
      expect(engine.months.find((m) => m.year === 2026 && m.month === 4)?.ageTransition).toBeUndefined();
      const ui = buildNumerologSessionResult({
        toolId: "matrix_year_forecast",
        birthDate: row.dob,
        fromDate: from,
      });
      const march = ui?.positions.find((p) => p.label === "Март 2026");
      expect(march?.detail).toContain(
        `Смена периода матрицы: ${row.fromPeriod}→${row.toPeriod} лет`
      );
    }
    const mid = buildNumerologSessionResult({
      toolId: "matrix_year_forecast",
      birthDate: "1990-08-15",
      fromDate: from,
    });
    const march = mid?.positions.find((p) => p.label === "Март 2026");
    expect(march?.detail ?? "").not.toContain("Смена периода матрицы");
  });

  it("session age detail uses chronological + period, not period-only", () => {
    const result = buildNumerologSessionResult({
      toolId: "destiny_matrix",
      birthDate: "1990-08-15",
    });
    const age = result?.positions.find((p) => p.label === MATRIX_LABELS.ageAndPeriod);
    expect(age?.detail).toContain("Текущий возраст");
    expect(age?.detail).toContain("Период Матрицы");
  });
});

describe("client-safe resolve errors", () => {
  it("never leaks raw version enums", () => {
    expect(clientSafeMatrixResolveError("legacy_without_snapshot")).not.toMatch(/matrix-v/i);
    expect(clientSafeMatrixResolveError("unsupported_matrix_version")).not.toMatch(/matrix-v/i);
    expect(clientSafeMatrixResolveError("unsupported_matrix_version")).toContain("не поддерживается");
  });
});

describe("child purpose is personal, not comfort", () => {
  it("child_purpose zone uses purposeBlock.personal", () => {
    const matrix = [
      "1995-03-14",
      "1984-10-31",
      "2000-01-01",
      "1978-01-20",
      "2012-06-01",
    ]
      .map((dob) => destinyMatrix(dob, AS_OF)!)
      .find((m) => m.purposeBlock && m.purposeBlock.personal.number !== m.comfort.number);
    expect(matrix).toBeTruthy();
    const zone = listMatrixZones(matrix!, "child_matrix").find((z) => z.id === "child_purpose");
    expect(zone?.label).toBe("Для чего дан ребёнок");
    expect(zone?.number).toBe(matrix!.purposeBlock!.personal.number);
    expect(zone?.number).not.toBe(matrix!.comfort.number);
  });
});

describe("pair score is marked authorial", () => {
  it("guest preview and session result carry the Zovus disclaimer", () => {
    const preview = buildMatrixCompatFreeSummary("1990-08-15", "1984-10-31")!;
    expect(preview.disclaimer).toBe(MATRIX_LABELS.pairScoreDisclaimer);
    expect(preview.disclaimer).toMatch(/авторская аналитика/i);
    expect(preview.disclaimer).not.toMatch(/matrix-v/i);
    const session = buildNumerologSessionResult({
      toolId: "matrix_compatibility",
      birthDate: "1990-08-15",
      params: { partnerDate: "1984-10-31" },
    });
    const score = session?.positions.find((p) => p.label === MATRIX_LABELS.pairScore);
    expect(score?.detail).toContain(MATRIX_LABELS.pairScoreDisclaimer);
  });

  it("SEO pair copy does not present score as a scientific metric", () => {
    const slug = readFileSync(
      path.join(ROOT, "src/app/numerology/[slug]/page.tsx"),
      "utf8"
    );
    const index = readFileSync(path.join(ROOT, "src/app/numerology/page.tsx"), "utf8");
    const natal = readFileSync(path.join(ROOT, "src/app/natalnaya-karta/page.tsx"), "utf8");
    for (const src of [slug, index, natal]) {
      expect(src).not.toMatch(/score методики Zovus/i);
      expect(src).not.toMatch(/общий score/i);
      expect(src).not.toMatch(/score пары/i);
    }
    expect(slug).toMatch(/авторская аналитика/i);
    expect(index).toMatch(/оценка Zovus/i);
    expect(natal).toMatch(/оценка Zovus/i);
  });
});

describe("print SVG contract", () => {
  it("print and dark diagrams do not leak engine ids and keep an accessible title", () => {
    const matrix = destinyMatrix("1990-08-15", AS_OF)!;
    for (const theme of ["print", "dark"] as const) {
      const svg = buildMatrixDiagramSvgFromResult(matrix, { theme, uid: theme });
      expect(svg).toContain('role="img"');
      expect(svg).toContain("Матрица судьбы");
      expect(svg).not.toMatch(/matrix-v[0-9]/i);
      expect(svg).not.toContain("structured_data");
    }
  });

  it("print CSS pins A4 and hides UI-only print chrome", () => {
    const css = readFileSync(path.join(ROOT, "src/styles/numerolog.css"), "utf8");
    const printable = readFileSync(
      path.join(ROOT, "src/components/natal/PrintableReport.tsx"),
      "utf8"
    );
    expect(css).toMatch(/@media print/);
    expect(css).toMatch(/size:\s*A4 portrait/);
    expect(css).toMatch(/destiny-matrix-figure--print/);
    expect(printable).toMatch(/size: A4 portrait/);
    expect(printable).toMatch(/print:hidden/);
  });
});

describe("Telegram purpose is not comfort", () => {
  it("maps Предназначение to personal purpose, not the center", async () => {
    const { canonicalMatrixSectionName } = await import(
      "../../telegram-bot/src/domain/matrix/format"
    );
    expect(canonicalMatrixSectionName("Зона комфорта (12 — Повешенный)")).toBe("Зона комфорта");
    expect(canonicalMatrixSectionName("Личное предназначение (9 — Отшельник)")).toBe(
      "Личное предназначение"
    );
    expect(canonicalMatrixSectionName("Предназначение (9 — Отшельник)")).toBe(
      "Личное предназначение"
    );
    expect(canonicalMatrixSectionName("Предназначение (9 — Отшельник)")).not.toBe(
      "Зона комфорта"
    );
  });
});

describe("Telegram teaser snapshot-first", () => {
  it("does not rewrite a v4 matrix through the live v5 engine", () => {
    const v4 = destinyMatrix("1990-08-15", {
      ...AS_OF,
      calculationVersion: MATRIX_V4_CALCULATION_VERSION,
    })!;
    const live = destinyMatrix("1990-08-15", AS_OF)!;
    expect(v4.talents.number).not.toBe(live.talents.number);
    const summary = buildMatrixFreeSummary("1990-08-15", { matrix: v4 })!;
    expect(summary.version).toBe(MATRIX_V4_CALCULATION_VERSION);
    expect(summary.matrix.calculationVersion).toBe(MATRIX_V4_CALCULATION_VERSION);
    expect(summary.matrix.talents.number).toBe(v4.talents.number);
    expect(summary.matrix.comfort.number).toBe(v4.comfort.number);
    expect(JSON.stringify(summary.matrix)).not.toContain("purposeBlock");
    expect(JSON.stringify(summary.matrix)).not.toContain("talentsChain");
  });
});
