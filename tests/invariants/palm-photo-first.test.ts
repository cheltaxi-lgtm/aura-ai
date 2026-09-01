/**
 * Palm reading UI is photo-first. Overlay is blocked: snapshot has no geometry.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  alignPalmSnapshot,
  normalizePalmSnapshot,
  toPalmTeaserSnapshot,
} from "@/lib/palm-constants";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("palm-photo-first", () => {
  it("snapshot contract has no coordinates, landmarks or polygons", () => {
    const constants = read("src/lib/palm-constants.ts");
    expect(constants).not.toMatch(/\b(coordinates|landmarks|polygon|normalizedPoints)\b/);
    const prompts = read("src/lib/palm-reading-prompts.ts");
    expect(prompts).not.toMatch(/\b(coordinates|landmarks|polygon)\b/);

    const snap = normalizePalmSnapshot({
      handDetected: true,
      whichHand: "right",
      handShape: "earth",
      majorLines: [
        { key: "life", present: true, length: "long", quality: "clear", note: "дуга к запястью" },
      ],
      mounts: [{ key: "venus", prominence: "strong", note: "полный холм" }],
      verdict: "vitality",
      teaser: "Тип земли: опора видна в форме ладони.",
    });
    expect(snap).not.toBeNull();
    expect(snap).not.toHaveProperty("coordinates");
    expect(JSON.stringify(snap)).not.toMatch(/"x"\s*:/);
  });

  it("teaser never ships line geometry that could fake an overlay", () => {
    const snap = normalizePalmSnapshot({
      handDetected: true,
      whichHand: "left",
      handShape: "water",
      majorLines: [{ key: "heart", present: true, length: "medium", quality: "forked", note: "" }],
      verdict: "love",
      teaser: "Линия сердца громче остальных.",
    });
    const teaser = toPalmTeaserSnapshot(alignPalmSnapshot(snap!));
    expect(teaser).not.toHaveProperty("majorLines");
    expect(teaser).not.toHaveProperty("mounts");
  });

  it("flow shows the user photo and never draws fake palm lines", () => {
    const flow = read("src/components/palm/PalmReadingFlow.tsx");
    const cards = read("src/components/palm/PalmInsightCards.tsx");
    const stage = read("src/components/palm/PalmPhotoStage.tsx");
    expect(existsSync(path.join(ROOT, "src/components/palm/PalmSilhouette.tsx"))).toBe(false);
    expect(flow).toContain('step === "preview"');
    expect(flow).toContain("palm-capture-surface");
    expect(flow).toContain("PalmInsightCards");
    expect(stage).toContain("palm-photo-stage");
    expect(read("src/styles/palm-flow.css")).toContain("object-fit: contain");
    expect(cards).toContain("No geometry");
    expect(cards).not.toContain("<svg");
    expect(flow).not.toContain("<svg");
  });

  it("cabinet does not present a schematic hand as the analysis result", () => {
    const cabinet = read("src/components/cabinet/CabinetPalmReadings.tsx");
    expect(cabinet).not.toContain("PalmSilhouette");
    expect(cabinet).toContain("PalmInsightCards");
    expect(cabinet).toContain("Фото не хранится");
  });

  it("pricing on the flow stays server-authored", () => {
    const flow = read("src/components/palm/PalmReadingFlow.tsx");
    expect(flow).toContain('fetch("/api/palm/pricing"');
    expect(flow).toContain("pricing.firstPalmDiscount");
    expect(flow).toContain("effectiveCost");
  });
});
