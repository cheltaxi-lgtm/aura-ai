import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sumDigits } from "@/lib/numerology/constants";
import {
  destinyMatrix as computeMatrix,
  MATRIX_CALCULATION_VERSION,
  reduceToArcanaNumber,
} from "@/lib/numerology/destiny-matrix";
import { buildMatrixDiagramSvg } from "@/lib/numerology/matrix-diagram-svg";
import {
  MATRIX_NODE_LAYOUT,
  MATRIX_ORIGIN,
  MATRIX_RADIUS,
  ANCESTRAL_SQUARE_IDS,
  OUTER_LAYOUT_IDS,
  PERSONAL_DIAMOND_IDS,
  STAR_OUTLINE,
  ageMarkPosition,
  polylineFor,
} from "@/lib/numerology/matrix-layout";
import { buildMatrixSemanticModel } from "@/lib/numerology/matrix-semantic-model";

const ROOT = path.resolve(__dirname, "../..");
const AS_OF = { asOfDate: "2026-08-18" } as const;

const VECTORS = [
  "1979-09-18",
  "1990-05-15",
  "2001-01-01",
  "2001-01-11",
  "2000-11-22",
  "1995-03-14",
  "1988-12-31",
  "2010-06-25",
] as const;

function independentCore(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const a = reduceToArcanaNumber(d);
  const b = reduceToArcanaNumber(m);
  const c = reduceToArcanaNumber(sumDigits(y));
  const g = reduceToArcanaNumber(a + b + c);
  const x = reduceToArcanaNumber(a + b + c + g);
  return {
    a,
    b,
    c,
    g,
    x,
    love: reduceToArcanaNumber(a + x),
    sky: reduceToArcanaNumber(b + x),
    money: reduceToArcanaNumber(c + x),
    mid: reduceToArcanaNumber(g + x),
    tip: reduceToArcanaNumber(g + reduceToArcanaNumber(g + x)),
    ab: reduceToArcanaNumber(a + b),
    bc: reduceToArcanaNumber(b + c),
    cg: reduceToArcanaNumber(c + g),
    ga: reduceToArcanaNumber(g + a),
    paternal: reduceToArcanaNumber(a + c),
    maternal: reduceToArcanaNumber(b + c),
  };
}

describe("destiny matrix calculation vectors", () => {
  it("keeps the canonical subtract-22 reducer", () => {
    expect(MATRIX_CALCULATION_VERSION).toBe("matrix-v3");
    expect(reduceToArcanaNumber(22)).toBe(22);
    expect(reduceToArcanaNumber(23)).toBe(1);
    expect(reduceToArcanaNumber(11)).toBe(11);
    expect(reduceToArcanaNumber(0)).toBe(22);
  });

  it("matches independent A/B/C/G/comfort arithmetic on fixture dates", () => {
    for (const birth of VECTORS) {
      const m = computeMatrix(birth, AS_OF);
      const raw = independentCore(birth);
      expect(m, birth).toBeTruthy();
      expect(m!.body.number, `${birth} A`).toBe(raw.a);
      expect(m!.energy.number, `${birth} B`).toBe(raw.b);
      expect(m!.roots.number, `${birth} C`).toBe(raw.c);
      expect(m!.karma.number, `${birth} G`).toBe(raw.g);
      expect(m!.comfort.number, `${birth} X`).toBe(raw.x);
      expect(m!.relationships.number, `${birth} love`).toBe(raw.love);
      expect(m!.skySpirit.number, `${birth} sky`).toBe(raw.sky);
      expect(m!.money.number, `${birth} money`).toBe(raw.money);
      expect(m!.karmicTail[1].number, `${birth} mid`).toBe(raw.mid);
      expect(m!.karmicTail[2].number, `${birth} tip`).toBe(raw.tip);
      expect(m!.talents.number, `${birth} AB`).toBe(raw.ab);
      expect(m!.paternal.number, `${birth} paternal`).toBe(raw.paternal);
      expect(m!.maternal.number, `${birth} maternal`).toBe(raw.maternal);
      expect(m!.maternal.number, `${birth} maternal=BC`).toBe(raw.bc);
    }
  });
});

describe("matrix semantic model", () => {
  it("maps engine points onto fixed octagram ids", () => {
    const m = computeMatrix("1979-09-18", AS_OF)!;
    const model = buildMatrixSemanticModel(m);
    const byId = Object.fromEntries(model.nodes.map((n) => [n.id, n]));
    expect(byId["outer.left"]?.number).toBe(m.body.number);
    expect(byId["outer.top"]?.number).toBe(m.energy.number);
    expect(byId["outer.right"]?.number).toBe(m.roots.number);
    expect(byId["outer.bottom"]?.number).toBe(m.karma.number);
    expect(byId.center?.number).toBe(m.comfort.number);
    expect(byId["horizontal.left"]?.number).toBe(m.relationships.number);
    expect(byId["horizontal.right"]?.number).toBe(m.money.number);
    expect(byId["vertical.top"]?.number).toBe(m.skySpirit.number);
    expect(byId["vertical.bottom"]?.number).toBe(m.earthTask.number);
    expect(byId["karmicTail.tip"]?.number).toBe(m.karmicTail[2].number);
    expect(byId["maleLine.head"]?.number).toBe(m.paternal.number);
    expect(byId["outer.topRight"]?.number).toBe(m.maternal.number);
    expect(byId["outer.topRight"]?.number).toBe(m.agePoints.find((p) => p.age === 30)?.number);
    expect(byId["outer.bottomRight"]?.number).toBe(m.agePoints.find((p) => p.age === 50)?.number);
    expect(byId["outer.bottomLeft"]?.number).toBe(m.agePoints.find((p) => p.age === 70)?.number);
  });

  it("does not invent extra displayed energies beyond the engine", () => {
    const m = computeMatrix("2000-11-22", AS_OF)!;
    const model = buildMatrixSemanticModel(m);
    const engineNumbers = new Set([
      m.body.number,
      m.energy.number,
      m.roots.number,
      m.karma.number,
      m.comfort.number,
      m.talents.number,
      m.relationships.number,
      m.money.number,
      m.paternal.number,
      m.maternal.number,
      m.skySpirit.number,
      m.earthTask.number,
      m.yearArcana.number,
      m.monthArcana.number,
      ...m.karmicTail.map((p) => p.number),
      ...m.agePoints.map((p) => p.number),
    ]);
    for (const node of model.nodes) {
      expect(engineNumbers.has(node.number), node.id).toBe(true);
    }
  });
});

describe("matrix layout geometry", () => {
  it("keeps coordinates independent of the birth date", () => {
    const a = JSON.stringify(MATRIX_NODE_LAYOUT);
    const first = computeMatrix("1979-09-18", AS_OF)!;
    const second = computeMatrix("2010-06-25", AS_OF)!;
    expect(first.body.number).not.toBe(second.body.number);
    expect(JSON.stringify(MATRIX_NODE_LAYOUT)).toBe(a);
    expect(MATRIX_NODE_LAYOUT.center).toEqual(MATRIX_ORIGIN);
  });

  it("places the eight outer vertices on a regular octagon", () => {
    for (const id of OUTER_LAYOUT_IDS) {
      const p = MATRIX_NODE_LAYOUT[id];
      const dist = Math.hypot(p.x - MATRIX_ORIGIN.x, p.y - MATRIX_ORIGIN.y);
      expect(dist).toBeCloseTo(MATRIX_RADIUS, 1);
    }
    expect(MATRIX_NODE_LAYOUT["outer.left"].y).toBeCloseTo(MATRIX_ORIGIN.y, 1);
    expect(MATRIX_NODE_LAYOUT["outer.right"].y).toBeCloseTo(MATRIX_ORIGIN.y, 1);
    expect(MATRIX_NODE_LAYOUT["outer.top"].x).toBeCloseTo(MATRIX_ORIGIN.x, 1);
    expect(MATRIX_NODE_LAYOUT["outer.bottom"].x).toBeCloseTo(MATRIX_ORIGIN.x, 1);
  });

  it("keeps age 0 on the left vertex and age 40 on the right", () => {
    const age0 = ageMarkPosition(0);
    const age40 = ageMarkPosition(40);
    expect(age0.x).toBeLessThan(MATRIX_ORIGIN.x);
    expect(age40.x).toBeGreaterThan(MATRIX_ORIGIN.x);
    expect(age0.y).toBeCloseTo(MATRIX_ORIGIN.y, 0);
    expect(age40.y).toBeCloseTo(MATRIX_ORIGIN.y, 0);
  });

  it("offsets age 60 off the karmic tail ray", () => {
    const bottom = MATRIX_NODE_LAYOUT["outer.bottom"];
    expect(ageMarkPosition(60).x).toBeLessThan(bottom.x - 20);
  });
});

describe("canonical matrix SVG", () => {
  it("keeps a circular age bezel and square-plus-diamond frame", () => {
    const m = computeMatrix("2001-01-11", AS_OF)!;
    const svg = buildMatrixDiagramSvg(buildMatrixSemanticModel(m), { uid: "star" });
    expect(STAR_OUTLINE).toHaveLength(16);
    expect(svg).toContain(`r="${MATRIX_RADIUS + 72}"`);
    expect(svg).toContain(polylineFor(PERSONAL_DIAMOND_IDS));
    expect(svg).toContain(polylineFor(ANCESTRAL_SQUARE_IDS));
    expect(svg).toContain('data-age="0"');
    expect(svg).toContain('data-age="40"');
    expect(svg).not.toContain("current");
  });

  it("emits one layered octagram with semantic channels", () => {
    const m = computeMatrix("2001-01-11", AS_OF)!;
    const svg = buildMatrixDiagramSvg(buildMatrixSemanticModel(m), { uid: "t" });
    expect(svg).toContain('data-layer="outer-geometry"');
    expect(svg).toContain('data-layer="age-scale"');
    expect(svg).toContain('data-layer="semantic-channels"');
    expect(svg).toContain('data-layer="generation-lines"');
    expect(svg).toContain('data-layer="nodes"');
    expect(svg).toContain('data-node="center"');
    expect(svg).toContain('data-node="karmicTail.tip"');
    expect(svg).toContain("Кармический хвост");
    expect(svg).toContain("Мужская линия");
    expect(svg).toContain("Женская линия");
    expect(svg).toContain("Отношения");
    expect(svg).toContain("Деньги");
    expect(svg).not.toContain(">Центр<");
    expect(svg).not.toContain("♀ линия");
    expect(svg).not.toContain("destiny-matrix--v2");
  });

  it("telegram fallback constants stay aligned with site layout", () => {
    const src = readFileSync(
      path.join(ROOT, "telegram-bot/src/render/matrix-diagram.ts"),
      "utf8"
    );
    expect(src).toContain(`const CX = ${MATRIX_ORIGIN.x}`);
    expect(src).toContain(`const CY = ${MATRIX_ORIGIN.y}`);
    expect(src).toContain(`const R = ${MATRIX_RADIUS}`);
    expect(src).toContain("canonical octagram");
    expect(src).not.toContain("grid-template-areas");
  });
});
