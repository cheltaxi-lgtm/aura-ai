/**
 * Aura other-person slots — no color lottery, no biometrics, no photo persist.
 *
 * Same slot + same Moscow day → reuse, no vision.
 * Core lock is per subject, not per account.
 * Kill-switch AURA_OTHER_SUBJECTS defaults off.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { auraSubjectNameKey } from "@/lib/aura-subject-name";
import { isAuraOtherSubjectsEnvOn } from "@/lib/settings";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("aura-subjects", () => {
  it("name key collapses case, yo and spaces so Маша is one slot", () => {
    expect(auraSubjectNameKey("  Маша  ")).toBe("маша");
    expect(auraSubjectNameKey("МАША")).toBe("маша");
    expect(auraSubjectNameKey("Алёна")).toBe("алена");
  });

  it("other-person slots stay behind an ENV kill-switch that defaults off", () => {
    expect(isAuraOtherSubjectsEnvOn()).toBe(false);
    const settings = read("src/lib/settings.ts");
    expect(settings).toContain("AURA_OTHER_SUBJECTS");
    expect(settings).toContain('raw === "true" || raw === "1"');
    expect(settings).toContain("auraOtherTeaserDayLimit");
  });

  it("teaser reuses the slot today before vision and does not inherit another person's core", () => {
    const teaser = read("src/app/api/aura/teaser/route.ts");
    const genAt = teaser.indexOf("await generateAuraSnapshot");
    const todayAt = teaser.indexOf("if (todays)");
    const nameExistsAt = teaser.indexOf("NAME_EXISTS");
    expect(todayAt).toBeGreaterThan(-1);
    expect(genAt).toBeGreaterThan(todayAt);
    expect(nameExistsAt).toBeGreaterThan(-1);
    expect(nameExistsAt).toBeLessThan(genAt);
    expect(teaser).toContain("skipSelfToday");
    expect(teaser).toContain("newOtherSlot");
    expect(teaser).toContain("getAuraBaseColorAnchor");
    expect(teaser).toContain("othersOn ? subjectId");
    expect(teaser).toContain("must not bind a foreign subject UUID");
    expect(teaser).toContain("ensureAuraOtherSubject");
    expect(teaser).toContain("findSimilarColorSubject");
    expect(teaser).not.toMatch(/localStorage/);
  });

  it("day lock, core anchor and paid day are scoped by subject_id", () => {
    const guest = read("src/lib/services/aura-guest-service.ts");
    const persist = read("src/lib/aura-reading-persist.ts");
    const report = read("src/app/api/aura/report/route.ts");
    const pricing = read("src/app/api/aura/pricing/route.ts");
    expect(guest).toContain("AND subject_id = $2");
    expect(guest).toContain("selfOrLegacyPredicate");
    expect(guest).toContain("listTodaysSnapshotIdsForSubject");
    expect(guest).not.toContain("COALESCE(subject_id");
    expect(guest).toContain("SELECT id FROM aura_subjects WHERE id = $1 AND user_id = $2");
    expect(persist).toContain("context_data->>'subjectId'");
    expect(report).toContain('day:${auraCalendarDayKey()}:${subjectId ?? "self"}');
    expect(report).toContain("listTodaysSnapshotIdsForSubject");
    expect(pricing).toContain("listTodaysSnapshotIdsForSubject");
  });

  it("picker requires a slot before the camera and never recaptures self as «другую ауру»", () => {
    const flow = read("src/components/aura/AuraReadingFlow.tsx");
    const picker = read("src/components/aura/AuraSubjectPicker.tsx");
    expect(flow).toContain("entry.subjectKind");
    expect(flow).toContain("AuraSubjectPicker");
    expect(flow).toContain("Снять другому человеку");
    expect(flow).not.toContain("Снять другую ауру");
    expect(flow).not.toContain("Вернуться к съёмке");
    expect(flow).not.toMatch(/localStorage/);
    expect(picker).toContain("Это кто-то из них?");
    expect(picker).toContain("Если это тот же человек");
    expect(picker).toContain("Новый человек");
  });

  it("photos stay hashed only; subjects table is separate from matrix_subjects", () => {
    const migration = read("scripts/migrations/144_migrate_aura_subjects.sql");
    const teaser = read("src/app/api/aura/teaser/route.ts");
    const service = read("src/lib/services/aura-guest-service.ts");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS aura_subjects");
    expect(migration).not.toContain("matrix_subjects");
    expect(teaser).not.toMatch(/INSERT.*image|photo_base64|image_bytes/);
    expect(service).toContain("never the photo");
    expect(service).toContain("photo_hash");
  });

  it("landing FAQ tells the truth about self vs other slots", () => {
    const landing = read("src/app/aura/page.tsx");
    expect(landing).toContain("Один снимок себя на календарный день");
    expect(landing).toContain("Можно снять ауру другого человека?");
    expect(landing).toContain("без выбора слота другой кадр даст другой цвет");
  });
});
