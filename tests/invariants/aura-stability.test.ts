/**
 * Aura color / day stability — methodology contract.
 *
 * Core (dominantColor) is stable for weeks. One snapshot per Moscow day.
 * Same photo bytes reuse the stored reading, scoped to this person.
 * Photos are never stored — only a hash and the structured snapshot.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { AURA_CADENCE_TZ, formatAuraWaitRu, nextAuraShotAt } from "@/lib/aura-cadence";
import {
  AURA_CORE_LOCK_MS,
  AURA_DAY_TIMEZONE,
  lockAuraCoreIfRecent,
} from "@/lib/services/aura-guest-service";
import { auraSpendBelongsToSnapshot } from "@/lib/aura-reading-billing";
import type { AuraSnapshot } from "@/lib/aura-constants";
import {
  AURA_CHAKRA_KEYS,
  AURA_COLORS,
  AURA_LAYER_KEYS,
  alignAuraSnapshotColors,
  normalizeAuraSnapshot,
} from "@/lib/aura-constants";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function stubSnapshot(dominantKey: "blue" | "gold"): AuraSnapshot {
  return {
    version: 1,
    faceDetected: true,
    dominantColor: AURA_COLORS[dominantKey],
    secondaryColors: [],
    layers: [],
    chakras: [],
    verdict: "mixed",
    teaser: "test",
    createdAt: new Date().toISOString(),
  };
}

describe("aura-stability", () => {
  it("teaser reuses today's snapshot and scoped photo hash without a new row", () => {
    const teaser = read("src/app/api/aura/teaser/route.ts");
    expect(teaser).toContain("findTodaysAuraSnapshotForUser");
    expect(teaser).toContain("findTodaysAuraSnapshotByClaimToken");
    expect(teaser).toContain("findScopedSnapshotByPhotoHash");
    expect(teaser).toContain("hashAuraPhoto(trimmed)");
    expect(teaser).toContain('reused: "today"');
    expect(teaser).toContain("claimed:");
    expect(teaser).toContain("hashSafe");
    expect(teaser).not.toContain("findRecentSnapshotByPhotoHash");

    const flow = read("src/components/aura/AuraReadingFlow.tsx");
    expect(flow).toContain("data.claimed === true");
    expect(flow).toContain("setReusedKind");
    expect(flow).toContain("/api/aura/today");
    expect(flow).toContain("AuraCadenceHint");
    expect(flow).not.toContain("Снять другую ауру");
    expect(flow).not.toContain("Вернуться к съёмке");

    const hint = read("src/components/aura/AuraCadenceHint.tsx");
    expect(hint).toContain("00:00 по Москве");
    expect(hint).toContain("Ядро (основной цвет)");
    expect(hint).toContain("раз в несколько дней");
    expect(hint).toContain("formatAuraWaitRu");

    const today = read("src/app/api/aura/today/route.ts");
    expect(today).toContain("findTodaysAuraSnapshotForUser");
    expect(today).toContain("if (othersOn) return emptyToday()");
    expect(today).toContain("findTodaysAuraSnapshotByClaimToken");
    expect(today).toContain("toAuraTeaserSnapshot");
    expect(today).toContain("findTodaysPaidAuraReport");
    const middleware = read("src/middleware.ts");
    expect(middleware).toContain('"/api/aura/today"');

    const genAt = teaser.indexOf("await generateAuraSnapshot");
    const todayAt = teaser.indexOf("if (todays)");
    expect(todayAt).toBeGreaterThan(-1);
    expect(genAt).toBeGreaterThan(todayAt);
  });

  it("photo-hash reuse is scoped to the account or this browser cookie", () => {
    const service = read("src/lib/services/aura-guest-service.ts");
    expect(service).toContain("claimed_user_id = $3");
    expect(service).toContain("claim_token_hash = $4");
    expect(service).toContain("claimed_user_id IS NULL");
    expect(service).toContain(AURA_DAY_TIMEZONE);
    expect(service).not.toMatch(
      /WHERE photo_hash = \$1\s+AND created_at > NOW\(\) - \$2::interval\s+ORDER BY/
    );
  });

  it("vision prompt keeps the core and evolves yesterday instead of rerolling", () => {
    const prompts = read("src/lib/aura-reading-prompts.ts");
    const teaser = read("src/app/api/aura/teaser/route.ts");
    expect(prompts).toContain("БАЗА ПОЛЯ");
    expect(prompts).toContain("ПРЕДЫДУЩИЙ СНИМОК");
    expect(prompts).toContain("эволюционируй");
    expect(prompts).toContain("previous?: AuraSnapshot");
    expect(teaser).toContain("previous: previous?.snapshot");
    expect(prompts).toContain("Ядро ауры стабильно");
  });

  it("held spend for this snapshot is reused, a different snapshot is blocked", () => {
    const mine = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const other = "11111111-2222-3333-4444-555555555555";
    expect(
      auraSpendBelongsToSnapshot([{ idempotencyKey: `aura-reading:${mine}` }], mine)
    ).toBe(true);
    expect(
      auraSpendBelongsToSnapshot(
        [{ idempotencyKey: `aura-reading:${mine}:${other}` }],
        mine
      )
    ).toBe(true);
    expect(
      auraSpendBelongsToSnapshot([{ idempotencyKey: `aura-reading:${other}` }], mine)
    ).toBe(false);
  });

  it("paid report is one per Moscow day even after a new snapshot", () => {
    const report = read("src/app/api/aura/report/route.ts");
    const pricing = read("src/app/api/aura/pricing/route.ts");
    const flow = read("src/components/aura/AuraReadingFlow.tsx");
    expect(report).toContain("findTodaysPaidAuraReport");
    expect(report).toContain("listTodaysUnrefundedAuraSpends");
    expect(report).toContain("auraSpendBelongsToSnapshot");
    expect(pricing).toContain("todayPaid");
    expect(flow).toContain("Разбор на сегодня готов");
    expect(flow).toContain("руны не спишутся");
  });

  it("saved reading shows a labeled color map and no empty photo plate", () => {
    const map = read("src/components/aura/AuraMap.tsx");
    const geo = read("src/components/aura/aura-viz-geometry.ts");
    const halo = read("src/components/aura/AuraHalo.tsx");
    const flow = read("src/components/aura/AuraReadingFlow.tsx");
    const cabinet = read("src/components/cabinet/CabinetAuraReadings.tsx");
    expect(map).toContain("aura-map__palette");
    expect(map).toContain("Семь слоёв");
    expect(map).toContain("Состояние чакр");
    expect(map).toContain("aura-viz__svg");
    expect(map).not.toContain("aura-map__layer-n ");
    expect(map).toContain("Исследовать слои ауры");
    expect(map).toContain("AURA_PRESENCE_PATH");
    expect(map).not.toContain("AURA_BODY_PATH");
    expect(geo).toContain("AURA_PRESENCE_PATH");
    expect(geo).toContain("AURA_LIGHT");
    expect(geo).toContain("AURA_FIELD_MASSES");
    expect(geo).not.toContain("AURA_BODY_PATH");
    expect(geo).not.toContain("AURA_LAYER_PATHS");
    const landing = read("src/app/aura/page.tsx");
    expect(landing).toContain("aura-flow-host");
    expect(landing).not.toContain("rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-8");
    expect(halo).toContain("if (!photoUrl) return null");
    expect(flow).toContain("{photoUrl ? (");
    expect(flow).toContain("<AuraMap");
    expect(flow).toContain("veiled");
    expect(cabinet).toContain("veiled={!active.paid}");
  });

  it("teaser never persists the original photo", () => {
    const teaser = read("src/app/api/aura/teaser/route.ts");
    const service = read("src/lib/services/aura-guest-service.ts");
    expect(teaser).not.toMatch(/INSERT.*image|photo_base64|image_bytes/);
    expect(service).toContain("never the photo");
    expect(service).toContain("photo_hash");
  });

  it("core lock holds for weeks; anchors older than the window do not force it", () => {
    const generated = stubSnapshot("gold");
    const recent = lockAuraCoreIfRecent(generated, {
      color: AURA_COLORS.blue,
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    expect(recent.dominantColor.key).toBe("blue");

    const twoDays = lockAuraCoreIfRecent(generated, {
      color: AURA_COLORS.blue,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });
    expect(twoDays.dominantColor.key).toBe("blue");

    const expired = lockAuraCoreIfRecent(generated, {
      color: AURA_COLORS.blue,
      createdAt: new Date(Date.now() - AURA_CORE_LOCK_MS - 1_000),
    });
    expect(expired.dominantColor.key).toBe("gold");
  });

  it("vision name/hex cannot drift off the catalog for a chosen key", () => {
    const parsed = normalizeAuraSnapshot({
      faceDetected: true,
      dominantColor: {
        key: "blue",
        name: "Изумрудный",
        hex: "#3fae7a",
        meaning: "честная речь сегодня",
      },
      secondaryColors: [{ key: "gold", name: "Жёлтый", hex: "#ffff00", meaning: "свет" }],
      layers: AURA_LAYER_KEYS.map((key) => ({ key, state: "ровный" })),
      chakras: AURA_CHAKRA_KEYS.map((key) => ({ key, openness: "balanced", note: "" })),
      verdict: "mixed",
      teaser: "Поле синее и спокойное.",
    });
    expect(parsed?.dominantColor).toMatchObject({
      key: "blue",
      name: AURA_COLORS.blue.name,
      hex: AURA_COLORS.blue.hex,
      meaning: "честная речь сегодня",
    });
    expect(parsed?.secondaryColors[0]).toMatchObject({
      key: "gold",
      name: AURA_COLORS.gold.name,
      hex: AURA_COLORS.gold.hex,
    });
  });

  it("core lock rewrites a lottery teaser and parks the discarded color as secondary", () => {
    const generated: AuraSnapshot = {
      ...stubSnapshot("gold"),
      teaser: "Золотой цвет говорит о зрелости и внутренней опоре.",
      secondaryColors: [AURA_COLORS.emerald],
    };
    const locked = lockAuraCoreIfRecent(generated, {
      color: { ...AURA_COLORS.blue, name: "Синева", hex: "#123456" },
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    expect(locked.dominantColor).toMatchObject({
      key: "blue",
      name: AURA_COLORS.blue.name,
      hex: AURA_COLORS.blue.hex,
    });
    expect(locked.teaser).toContain(AURA_COLORS.blue.name);
    expect(locked.teaser).not.toContain(AURA_COLORS.gold.name);
    expect(locked.secondaryColors.map((c) => c.key)).toEqual(["gold", "emerald"]);
  });

  it("same-key lock and archive read heal a lottery teaser but keep a mixed-color sentence", () => {
    const sameKey = lockAuraCoreIfRecent(
      {
        ...stubSnapshot("blue"),
        teaser: "Золотой цвет говорит о зрелости и внутренней опоре.",
      },
      {
        color: AURA_COLORS.blue,
        createdAt: new Date(Date.now() - 10 * 60 * 1000),
      }
    );
    expect(sameKey.dominantColor.key).toBe("blue");
    expect(sameKey.teaser).toContain(AURA_COLORS.blue.name);
    expect(sameKey.teaser).not.toContain(AURA_COLORS.gold.name);

    const mixed = alignAuraSnapshotColors({
      ...stubSnapshot("blue"),
      teaser: "Синий с золотым отливом на периферии.",
    });
    expect(mixed.teaser).toBe("Синий с золотым отливом на периферии.");

    const drifted = alignAuraSnapshotColors({
      ...stubSnapshot("blue"),
      dominantColor: { ...AURA_COLORS.blue, name: "Синева", hex: "#123456" },
      teaser: "Золотой цвет говорит о зрелости.",
    });
    expect(drifted.dominantColor).toMatchObject({
      name: AURA_COLORS.blue.name,
      hex: AURA_COLORS.blue.hex,
    });
    expect(drifted.teaser).toContain(AURA_COLORS.blue.name);
    expect(drifted.teaser).not.toContain(AURA_COLORS.gold.name);
  });

  it("next shot is the following Moscow midnight and wait copy stays human", () => {
    const now = new Date();
    const next = nextAuraShotAt(now);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
    expect(next.getTime() - now.getTime()).toBeLessThanOrEqual(36 * 60 * 60 * 1000);
    const wait = formatAuraWaitRu(now);
    expect(wait === "меньше чем через минуту" || wait.startsWith("через ")).toBe(true);
    expect(AURA_CADENCE_TZ).toBe(AURA_DAY_TIMEZONE);
    const cadence = read("src/lib/aura-cadence.ts");
    expect(cadence).toContain("Europe/Moscow");
    expect(cadence).not.toContain("aura-guest-service");
    expect(cadence).not.toContain("getTimezoneOffset");
  });

  it("palette is the source of truth for name and hex on every read path", () => {
    const constants = read("src/lib/aura-constants.ts");
    const guest = read("src/lib/services/aura-guest-service.ts");
    const persist = read("src/lib/aura-reading-persist.ts");
    const archive = read("src/lib/aura-reading-archive.ts");
    const prompts = read("src/lib/aura-reading-prompts.ts");
    expect(constants).toContain("export function alignAuraColorToCatalog");
    expect(guest).toContain("alignAuraSnapshotColors(row.snapshot)");
    expect(guest).toContain("alignAuraColorToCatalog(color)");
    expect(guest).toContain("healAuraTeaser");
    expect(persist).toContain("alignAuraSnapshotColors(params.snapshot)");
    expect(archive).toContain("alignAuraSnapshotColors(candidate as AuraSnapshot)");
    expect(prompts).toContain("alignAuraSnapshotColors(snapshot)");
    expect(prompts).toContain("строго из палитры для выбранного key");
  });
});
