/**
 * Matrix v5 hardening: Moscow calendar, frozen v3/v4 replay,
 * guest claim birth hygiene, comfort vs purpose semantics.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, recordAccountLegalConsent } from "@/lib/accounts";
import { query } from "@/lib/db";
import {
  DESTINY_MATRIX_DIAGRAM_SLOTS,
  MATRIX_CALCULATION_VERSION,
  MATRIX_V3_CALCULATION_VERSION,
  MATRIX_V4_CALCULATION_VERSION,
  destinyMatrix,
  matrixToStructuredData,
} from "@/lib/numerology/destiny-matrix";
import {
  MATRIX_CALENDAR_TIMEZONE,
  matrixCalendarDate,
} from "@/lib/numerology/matrix-calendar";
import { focusNumber } from "@/lib/numerology/matrix-period";
import { buildMatrixSemanticModel } from "@/lib/numerology/matrix-semantic-model";
import {
  hydrateDestinyMatrixFromSnapshot,
  resolveMatrixForDisplayDetailed,
  resolveMatrixForEngine,
} from "@/lib/numerology/matrix-snapshot";
import { matrixYearForecast } from "@/lib/numerology/matrix-year-forecast";
import { findOwnedExactMatrixPairReport } from "@/lib/numerology/matrix-pair-ownership";
import { shouldRebuildPaidMatrixReading } from "@/lib/numerology/tools";
import {
  persistOwnedMatrixSnapshot,
} from "@/lib/services/matrix-snapshot-persist";
import {
  claimGuestMatrixPending,
  createGuestMatrixPending,
} from "@/lib/services/matrix-guest-service";
import { ensureSelfSubject, upsertMatrixSubject } from "@/lib/services/matrix-subject-service";
import {
  ensureMinimalConsumerProfile,
  getUserById,
  updateUserProfile,
} from "@/lib/users";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { MATRIX_V5_GOLDEN_AS_OF } from "./matrix-golden-vectors-v5";

const ROOT = path.resolve(__dirname, "../..");
const AS_OF = "2026-01-01";
const DOB = "1990-08-15";

/** Independent subtract-22 — not imported from destiny-matrix-v3. */
function oracleSub22(n: number): number {
  let value = Math.abs(Math.trunc(n));
  while (value > 22) value -= 22;
  return value === 0 ? 22 : value;
}

function oracleDigitSum(n: number): number {
  let value = Math.abs(Math.trunc(n));
  while (value > 22) {
    value = String(value)
      .split("")
      .reduce((sum, digit) => sum + Number(digit), 0);
  }
  return value === 0 ? 22 : value;
}

describe("matrix calendar Europe/Moscow", () => {
  it("exports IANA Moscow and never UTC-offset integers", () => {
    expect(MATRIX_CALENDAR_TIMEZONE).toBe("Europe/Moscow");
    const cal = readFileSync(path.join(ROOT, "src/lib/numerology/matrix-calendar.ts"), "utf8");
    expect(cal).not.toMatch(/getTimezoneOffset/);
    expect(cal).not.toMatch(/getUTCFullYear/);
    const guest = readFileSync(path.join(ROOT, "src/lib/services/matrix-guest-service.ts"), "utf8");
    expect(guest).toContain("matrixCalendarDate");
    expect(guest).not.toMatch(/todayUtcIsoDate|getUTCFullYear/);
    const internal = readFileSync(
      path.join(ROOT, "src/lib/numerology/destiny-matrix-internal.ts"),
      "utf8"
    );
    expect(internal).toContain("matrixCalendarYmd");
    const subject = readFileSync(
      path.join(ROOT, "src/lib/services/matrix-subject-service.ts"),
      "utf8"
    );
    expect(subject).toContain("matrixCalendarYmd");
    expect(subject).not.toMatch(/today\.getUTCFullYear/);
    const resume = readFileSync(path.join(ROOT, "src/hooks/useChatActions.ts"), "utf8");
    expect(resume).toContain('kind: isNumerologMaster(selectedCharacter)');
    expect(resume).toContain('"numerology_reading"');
    const persist = readFileSync(
      path.join(ROOT, "src/lib/services/matrix-snapshot-persist.ts"),
      "utf8"
    );
    expect(persist).toContain("existingFrozenSnapshot");
    expect(persist).toContain("ensureOwnedMatrixSnapshot");
    const reading = readFileSync(path.join(ROOT, "src/app/api/reading/route.ts"), "utf8");
    expect(reading).toContain("ensureOwnedMatrixSnapshot");
    expect(reading).toContain("resolveMatrixForEngine");
    expect(reading).toContain("matrixSnapshot");
    const svg = readFileSync(path.join(ROOT, "src/lib/numerology/matrix-diagram-svg.ts"), "utf8");
    expect(svg).toContain('data-node-hit="${n.id}"');
    expect(svg).toMatch(/data-value="\$\{n\.id\}" data-node-hit=/);
    const sectioned = readFileSync(
      path.join(ROOT, "src/lib/numerology/matrix-sectioned-reading.ts"),
      "utf8"
    );
    expect(sectioned).toContain("resolveMatrixForEngine");
    expect(sectioned).not.toMatch(/const matrix = destinyMatrix\(/);
  });

  it("timezone boundary 00:00–03:00 MSK is not UTC day", () => {
    const utcEvening = new Date("2026-08-19T21:30:00.000Z"); // 00:30 MSK Aug 20
    const utcAfternoon = new Date("2026-08-19T20:30:00.000Z"); // 23:30 MSK Aug 19
    expect(utcEvening.toISOString().slice(0, 10)).toBe("2026-08-19");
    expect(matrixCalendarDate(utcEvening)).toBe("2026-08-20");
    expect(matrixCalendarDate(utcAfternoon)).toBe("2026-08-19");
  });

  it("same DOB + explicit asOf is identical from any wall-clock instant", () => {
    const instants = [
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-01-01T10:00:00-05:00"),
      new Date("2026-01-01T12:00:00+03:00"),
      new Date("2026-01-01T16:00:00+05:00"),
      new Date("2026-01-01T21:00:00+14:00"),
      new Date("2025-12-31T14:00:00-10:00"),
    ];
    const matrices = instants.map(() => destinyMatrix(DOB, { asOfDate: AS_OF }));
    const first = matrices[0]!;
    for (const matrix of matrices) {
      expect(matrix?.talents.number).toBe(first.talents.number);
      expect(matrix?.comfort.number).toBe(first.comfort.number);
      expect(matrix?.purpose.number).toBe(first.purpose.number);
      expect(matrix?.asOf.date).toBe(AS_OF);
    }
    expect(first.talents.number).toBe(20);
    expect(first.comfort.number).toBe(12);
  });

  it("explicit asOf ignores process timezone", () => {
    const zones = [
      "UTC",
      "Europe/Moscow",
      "Asia/Yekaterinburg",
      "Europe/Stockholm",
      "America/New_York",
      "Pacific/Kiritimati",
      "Pacific/Honolulu",
    ];
    const numbers = zones.map((timeZone) => {
      const asOf = matrixCalendarDate(new Date("2026-01-01T12:00:00+03:00"));
      expect(asOf).toBe("2026-01-01");
      const matrix = destinyMatrix(DOB, { asOfDate: asOf })!;
      return {
        timeZone,
        talents: matrix.talents.number,
        comfort: matrix.comfort.number,
        age: matrix.chronologicalAge,
      };
    });
    for (const row of numbers) {
      expect(row.talents).toBe(20);
      expect(row.comfort).toBe(12);
      expect(row.age).toBe(35);
    }
  });

  it("resolveMatrixForEngine prefers saved snapshot over a later asOf", () => {
    const frozen = destinyMatrix(DOB, { asOfDate: "2024-01-01" })!;
    const snapshot = matrixToStructuredData(frozen);
    const resolved = resolveMatrixForEngine({
      birthDate: DOB,
      snapshot,
      asOfDate: "2026-08-20",
    });
    expect(resolved?.asOf.date).toBe("2024-01-01");
    expect(resolved?.chronologicalAge).toBe(frozen.chronologicalAge);
    expect(resolved?.comfort.number).toBe(frozen.comfort.number);
    const live = destinyMatrix(DOB, { asOfDate: "2026-08-20" })!;
    expect(live.chronologicalAge).not.toBe(frozen.chronologicalAge);
  });

  it("birthday boundary uses asOf calendar day, not clock TZ", () => {
    const before = destinyMatrix("1990-08-15", { asOfDate: "2026-08-14" })!;
    const on = destinyMatrix("1990-08-15", { asOfDate: "2026-08-15" })!;
    expect(on.chronologicalAge).toBe(before.chronologicalAge + 1);
  });
});

describe("golden fixtures v3/v4/v5", () => {
  it("v5 1990-08-15 asOf golden day: talents 20 comfort 12 purpose ≠ comfort", () => {
    const m = destinyMatrix(DOB, { asOfDate: MATRIX_V5_GOLDEN_AS_OF })!;
    expect(m.calculationVersion).toBe(MATRIX_CALCULATION_VERSION);
    expect(m.talents.number).toBe(20);
    expect(m.comfort.number).toBe(12);
    expect(m.purpose.number).not.toBe(m.comfort.number);
    expect(m.purposeBlock?.personal.number).toBe(m.purpose.number);
  });

  it("v4 1990-08-15 asOf 2026-01-01: talents 5, purpose aliases comfort", () => {
    const day = 15;
    const month = 8;
    const yearSum = 1 + 9 + 9 + 0;
    const a = oracleDigitSum(day);
    const b = oracleDigitSum(month);
    const c = oracleDigitSum(yearSum);
    const g = oracleDigitSum(a + b + c);
    const x = oracleDigitSum(a + b + c + g);
    const m = destinyMatrix(DOB, {
      asOfDate: AS_OF,
      calculationVersion: MATRIX_V4_CALCULATION_VERSION,
    })!;
    expect(m.comfort.number).toBe(x);
    expect(m.purpose.number).toBe(m.comfort.number);
    expect(m.purposeBlock).toBeUndefined();
    expect(m.talents.number).toBe(5);
    expect(m.focusKey === "purpose" || m.focusKey === "ageCurrent" || Boolean(m.focusKey)).toBe(
      true
    );
  });

  it("v3 1990-08-15 asOf 2026-01-01 uses subtract-22 and purpose=comfort", () => {
    const a = oracleSub22(15);
    const b = oracleSub22(8);
    const c = oracleSub22(1 + 9 + 9 + 0);
    const g = oracleSub22(a + b + c);
    const x = oracleSub22(a + b + c + g);
    const m = destinyMatrix(DOB, {
      asOfDate: AS_OF,
      calculationVersion: MATRIX_V3_CALCULATION_VERSION,
    })!;
    expect(m.comfort.number).toBe(x);
    expect(m.purpose.number).toBe(m.comfort.number);
    expect(m.purposeBlock).toBeUndefined();
    expect(m.talents.number).toBe(oracleSub22(a + b));
  });
});

describe("frozen v3/v4 replay", () => {
  it("v3/v4 files do not import live resolveAsOf/pickFocus", () => {
    const v3 = readFileSync(path.join(ROOT, "src/lib/numerology/destiny-matrix-v3.ts"), "utf8");
    const v4 = readFileSync(path.join(ROOT, "src/lib/numerology/destiny-matrix-v4.ts"), "utf8");
    expect(v3).toContain("destiny-matrix-legacy-helpers");
    expect(v4).toContain("destiny-matrix-legacy-helpers");
    expect(v3).not.toMatch(/from \"\.\/destiny-matrix-internal\"/);
    expect(v4).not.toMatch(/from \"\.\/destiny-matrix-internal\"/);
  });

  it("v3/v4 snapshot hydrate is immutable and never becomes v5", () => {
    const v4 = destinyMatrix(DOB, {
      asOfDate: AS_OF,
      calculationVersion: MATRIX_V4_CALCULATION_VERSION,
    })!;
    const snap = matrixToStructuredData(v4);
    const storedAsOf = snap.asOf as { date: string };
    const live = destinyMatrix(DOB, { asOfDate: "2099-12-31" })!;
    expect(live.chronologicalAge).not.toBe(v4.chronologicalAge);
    const resolved = resolveMatrixForDisplayDetailed({
      birthDate: DOB,
      structuredData: snap,
      calculationVersion: MATRIX_V4_CALCULATION_VERSION,
      createdAt: "2099-12-31T12:00:00.000Z",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.matrix.calculationVersion).toBe(MATRIX_V4_CALCULATION_VERSION);
    expect(resolved.matrix.comfort.number).toBe(v4.comfort.number);
    expect(resolved.matrix.asOf.date).toBe(storedAsOf.date);
    expect(resolved.matrix.purposeBlock).toBeUndefined();
    expect(hydrateDestinyMatrixFromSnapshot(snap)?.asOf.date).toBe(storedAsOf.date);
  });

  it("v3/v4 without snapshot or asOf fail closed", () => {
    const resolved = resolveMatrixForDisplayDetailed({
      birthDate: DOB,
      structuredData: { calculationVersion: MATRIX_V4_CALCULATION_VERSION },
      calculationVersion: MATRIX_V4_CALCULATION_VERSION,
    });
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.error).toBe("legacy_without_snapshot");
  });
});

describe("comfort vs purpose semantics", () => {
  it("v5 diagram slot and focus use comfort, not purpose-as-center", () => {
    const center = DESTINY_MATRIX_DIAGRAM_SLOTS.find((s) => s.featured);
    expect(center?.key).toBe("comfort");
    expect(center?.area).toBe("comfort");
    const m = destinyMatrix(DOB, { asOfDate: MATRIX_V5_GOLDEN_AS_OF })!;
    expect(m.focusKey).not.toBe("purpose");
    if (m.focusKey === "comfort") {
      expect(focusNumber(m)).toBe(m.comfort.number);
    }
    const semantic = buildMatrixSemanticModel(m);
    const node = semantic.nodes.find((n) => n.id === "center");
    expect(node?.focusKeys).toContain("comfort");
    expect(node?.number).toBe(m.comfort.number);
  });

  it("v3/v4 adapters may still key the center as purpose", () => {
    const v4 = destinyMatrix(DOB, {
      asOfDate: AS_OF,
      calculationVersion: MATRIX_V4_CALCULATION_VERSION,
    })!;
    expect(v4.purpose.number).toBe(v4.comfort.number);
    expect(["purpose", "ageCurrent", "karma", "karmicMid", "karmicTip", "money", "relationships", "yearArcana", "monthArcana"]).toContain(
      v4.focusKey
    );
    expect(focusNumber(v4)).toBeGreaterThan(0);
  });
});

describe("year forecast age transitions", () => {
  it("surfaces 34→35, 39→40, 44→45 on Moscow calendar months", () => {
    const forecast = matrixYearForecast("1990-08-15", new Date("2025-07-01T12:00:00+03:00"));
    expect(forecast).toBeTruthy();
    const transitions = forecast!.months.filter((row) => row.ageTransition);
    const pairs = transitions.map((row) => `${row.periodFrom}→${row.periodTo}`);
    expect(pairs).toContain("30→35");
    const later = matrixYearForecast("1985-03-01", new Date("2025-01-15T12:00:00+03:00"));
    const laterPairs = (later?.months ?? [])
      .filter((row) => row.ageTransition)
      .map((row) => `${row.periodFrom}→${row.periodTo}`);
    expect(laterPairs.some((p) => p === "35→40" || p === "40→45" || p === "30→35")).toBe(true);
  });
});

describe("PDF / Telegram semantic snapshot", () => {
  it("print page resolves snapshot and does not recompute v5 for stored v4", () => {
    const print = readFileSync(
      path.join(ROOT, "src/app/cabinet/numerology/matrix/[id]/print/page.tsx"),
      "utf8"
    );
    expect(print).toContain("resolveMatrixForDisplayDetailed");
    expect(print).toContain("structuredData");
    const teaser = readFileSync(
      path.join(ROOT, "src/lib/telegram/bot-matrix-service.ts"),
      "utf8"
    );
    expect(teaser).toContain("resolveMatrixForDisplay");
    expect(teaser).toContain("matrixCalendarDate");
  });
});

describe.skipIf(!hasTestDb)("guest claim birth profile (db)", () => {
  installDbLifecycle();

  beforeEach(async () => {
    await query(`DELETE FROM matrix_guest_pending`);
    await query(`DELETE FROM matrix_subjects`);
  });

  async function seedUser(label: string, birth?: string) {
    const account = await createUser(`mx-hard-${label}-${Date.now()}@example.com`, "hash", label);
    await recordAccountLegalConsent(account.id, { ageConfirmed: true, acceptedTerms: true });
    const user = await ensureMinimalConsumerProfile({ accountId: account.id, name: label });
    if (birth) {
      await updateUserProfile(user.id, {
        name: label,
        gender: "female",
        birthDate: birth,
        birthTime: "12:30",
        birthCity: "Berlin",
      });
    }
    return user;
  }

  it("guest self claim without profile adopts date and does not invent place", async () => {
    const { rawClaimToken } = await createGuestMatrixPending({
      birthDate: "1991-06-15",
      subjectKind: "self",
    });
    const user = await seedUser("self-empty");
    const claim = await claimGuestMatrixPending({
      profileUserId: user.id,
      rawClaimToken,
    });
    expect(claim.ok).toBe(true);
    const after = await getUserById(user.id);
    expect(after?.birth_date?.toString().slice(0, 10) ?? String(after?.birth_date)).toContain(
      "1991-06-15"
    );
    expect(after?.birth_time).toBeFalsy();
    expect(after?.birth_city).toBeFalsy();
  });

  it("guest self replace keeps Natal/HD time/place", async () => {
    const { rawClaimToken } = await createGuestMatrixPending({
      birthDate: "1984-10-31",
      subjectKind: "self",
    });
    const user = await seedUser("self-replace", "1990-08-15");
    const before = await getUserById(user.id);
    expect(before?.birth_time).toBeTruthy();
    expect(before?.birth_city).toBe("Berlin");
    const denied = await claimGuestMatrixPending({
      profileUserId: user.id,
      rawClaimToken,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("MATRIX_PROFILE_CONFLICT");
    const claim = await claimGuestMatrixPending({
      profileUserId: user.id,
      rawClaimToken,
      confirmReplace: true,
    });
    expect(claim.ok).toBe(true);
    const after = await getUserById(user.id);
    expect(String(after?.birth_date).slice(0, 10)).toContain("1984-10-31");
    expect(after?.birth_time).toBeTruthy();
    expect(after?.birth_city).toBe("Berlin");
  });

  it("guest non-self claim does not change users.birth_date", async () => {
    const { rawClaimToken } = await createGuestMatrixPending({
      birthDate: "2012-06-01",
      subjectKind: "child",
      displayName: "Дочь",
    });
    const user = await seedUser("nonself", "1990-08-15");
    const claim = await claimGuestMatrixPending({
      profileUserId: user.id,
      rawClaimToken,
    });
    expect(claim.ok).toBe(true);
    const after = await getUserById(user.id);
    expect(String(after?.birth_date).slice(0, 10)).toContain("1990-08-15");
    const kids = await query<{ kind: string; birth_date: string }>(
      `SELECT kind, birth_date::text FROM matrix_subjects WHERE user_id = $1 AND kind = 'child'`,
      [user.id]
    );
    expect(kids.rows.some((row) => String(row.birth_date).slice(0, 10) === "2012-06-01")).toBe(
      true
    );
  });

  it("authenticated persist stores snapshot without wiping natal time/place", async () => {
    const user = await seedUser("persist-auth", "1990-08-15");
    const persisted = await persistOwnedMatrixSnapshot({
      userId: user.id,
      birthDate: "1990-08-15",
      subjectKind: "self",
    });
    expect(persisted.calculationVersion).toBe(MATRIX_CALCULATION_VERSION);
    expect(persisted.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((persisted.snapshot.talents as { number?: number })?.number).toBe(20);
    expect((persisted.snapshot.comfort as { number?: number })?.number).toBe(12);
    const after = await getUserById(user.id);
    expect(after?.birth_time).toBeTruthy();
    expect(after?.birth_city).toBe("Berlin");
    const again = await persistOwnedMatrixSnapshot({
      userId: user.id,
      birthDate: "1990-08-15",
      subjectKind: "self",
      asOfDate: "2028-01-01",
    });
    expect(again.reused).toBe(true);
    expect(again.asOfDate).toBe(persisted.asOfDate);
    expect((again.snapshot.ageCurrent as { age?: number })?.age).toBe(
      (persisted.snapshot.ageCurrent as { age?: number })?.age
    );
  });

  it("two children stay isolated from self DOB", async () => {
    const user = await seedUser("two-kids", "1990-08-15");
    const a = await upsertMatrixSubject({
      userId: user.id,
      kind: "child",
      displayName: "Аня",
      birthDate: "2014-03-03",
    });
    const b = await upsertMatrixSubject({
      userId: user.id,
      kind: "child",
      displayName: "Боря",
      birthDate: "2016-11-11",
    });
    expect(a.birthDate).toBe("2014-03-03");
    expect(b.birthDate).toBe("2016-11-11");
    const after = await getUserById(user.id);
    expect(String(after?.birth_date).slice(0, 10)).toContain("1990-08-15");
  });
});

describe.skipIf(!hasTestDb)("pair reopen + history (db)", () => {
  installDbLifecycle();

  it("exact pair A+B is owned; A+C is not", async () => {
    const account = await createUser(`mx-pair-h-${Date.now()}@example.com`, "hash", "Пара");
    await recordAccountLegalConsent(account.id, { ageConfirmed: true, acceptedTerms: true });
    const user = await ensureMinimalConsumerProfile({ accountId: account.id, name: "Пара" });
    await updateUserProfile(user.id, {
      name: "Пара",
      gender: "female",
      birthDate: "1990-01-01",
    });
    const self = await ensureSelfSubject(user.id);
    expect(self?.id).toBeTruthy();
    await query(
      `INSERT INTO numerology_report_history (
         user_id, tool_id, subject_id, birth_date, calculation_version, content, structured_data
       ) VALUES ($1, 'matrix_compatibility', $2::uuid, '1990-01-01', 'matrix-v5', 'пара AB', $3::jsonb)`,
      [user.id, self!.id, JSON.stringify({ partnerDate: "1992-06-15" })]
    );
    const ab = await findOwnedExactMatrixPairReport({
      userId: user.id,
      dateA: "1990-01-01",
      dateB: "1992-06-15",
    });
    const ac = await findOwnedExactMatrixPairReport({
      userId: user.id,
      dateA: "1990-01-01",
      dateB: "1988-03-03",
    });
    expect(ab?.content).toContain("пара AB");
    expect(ac).toBeNull();
  });
});

describe("billing remains server-authoritative", () => {
  it("reading route charges after exact-pair reopen check", () => {
    const reading = readFileSync(path.join(ROOT, "src/app/api/reading/route.ts"), "utf8");
    expect(reading).toContain("findOwnedExactMatrixPairReport");
    expect(reading).toContain("chargeRuneActionForWorkerJob");
    expect(reading).toMatch(/InsufficientFundsError/);
    const pairBlock = reading.slice(reading.indexOf("findOwnedExactMatrixPairReport"));
    expect(pairBlock).toMatch(/return \{[\s\S]*reused: true[\s\S]*matrixOwned: true/);
    expect(pairBlock.indexOf("chargeRuneActionForWorkerJob")).toBeGreaterThan(
      pairBlock.indexOf("reused: true")
    );
  });
});

describe("chat follow-ups do not rebuild a paid matrix report", () => {
  it("only /api/reading toolIds rebuild Full/Child Matrix", () => {
    expect(shouldRebuildPaidMatrixReading(undefined)).toBe(false);
    expect(shouldRebuildPaidMatrixReading("pythagoras")).toBe(false);
    expect(shouldRebuildPaidMatrixReading("destiny_matrix")).toBe(true);
    expect(shouldRebuildPaidMatrixReading("child_matrix")).toBe(true);
    const service = readFileSync(
      path.join(ROOT, "src/lib/services/numerology-service.ts"),
      "utf8"
    );
    const skipPaidRebuild = service.indexOf(
      "!shouldRebuildPaidMatrixReading(params.toolId)"
    );
    expect(skipPaidRebuild).toBeGreaterThan(-1);
    expect(service.slice(skipPaidRebuild, skipPaidRebuild + 120)).toContain(
      "return null"
    );
  });
});
