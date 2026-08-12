/**
 * P1.2: multiproduct homepage — 4 public entries + root SEO.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EDITORIAL_HERO, EDITORIAL_PRODUCT_ENTRIES } from "@/lib/editorial-landing-content";

const ROOT = path.resolve(__dirname, "../..");

describe("multiproduct-homepage", () => {
  it("hero is multiproduct, not Tarot-only", () => {
    expect(EDITORIAL_HERO.title).toBe(
      "Понять себя. Увидеть ситуацию. Выбрать следующий шаг."
    );
    expect(EDITORIAL_HERO.subtitle.toLowerCase()).toMatch(/матриц/);
    expect(EDITORIAL_HERO.subtitle.toLowerCase()).toMatch(/натал|натальн/);
    expect(EDITORIAL_HERO.subtitle.toLowerCase()).toMatch(/дизайн/);
    expect(EDITORIAL_HERO.subtitle.toLowerCase()).toMatch(/таро/);
    // Quick Tarot path kept.
    expect(EDITORIAL_HERO.primaryCta.toLowerCase()).toMatch(/3 карты|три карты/);
  });

  it("four product CTAs point to correct public flows", () => {
    const byId = Object.fromEntries(EDITORIAL_PRODUCT_ENTRIES.map((e) => [e.id, e]));
    expect(byId.matrix?.href).toBe("/numerology/destiny-matrix");
    expect(byId.matrix?.cta).toMatch(/бесплатно/i);
    expect(byId.natal?.href).toBe("/natalnaya-karta");
    expect(byId.natal?.cta).toMatch(/построить/i);
    expect(byId.hd?.href).toBe("/dizayn-cheloveka/rasschitat");
    expect(byId.hd?.cta).toMatch(/бодиграф/i);
    expect(byId.tarot?.kind).toBe("action");
    expect(byId.tarot?.cta).toMatch(/3 карты|три карты/i);
  });

  it("guest landing mounts product entries before guest spread; Tarot is action not auth redirect", () => {
    const landing = readFileSync(
      path.join(ROOT, "src/components/AuraSellingLanding.tsx"),
      "utf8"
    );
    expect(landing).toMatch(/EditorialProductEntries/);
    expect(landing).toMatch(/onTarotCta=\{\(\) => startGuestSpread\(\)\}/);

    const entries = readFileSync(
      path.join(ROOT, "src/components/editorial/EditorialProductEntries.tsx"),
      "utf8"
    );
    expect(entries).toMatch(/onTarotCta/);
    expect(entries).not.toMatch(/buildRegisterHref|\/auth\/user\/register/);

    const page = readFileSync(path.join(ROOT, "src/app/page.tsx"), "utf8");
    expect(page).toMatch(/Матрица судьбы, Натальная карта, Дизайн человека и Таро/);
    expect(page).not.toMatch(/absolute: "Расклад Таро онлайн бесплатно/);
  });
});
