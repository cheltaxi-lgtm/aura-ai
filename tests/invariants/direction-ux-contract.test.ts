import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAuthProduct, authProductCopy } from "../../src/lib/auth-product-context";
import { formatBirthPlaceLabel, rankBirthPlaces } from "../../src/lib/place-presentation";
import { resolveProductHeaderAction } from "../../src/lib/product-header-action";

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("direction UX contract", () => {
  it("keeps header and registration copy tied to the active direction", () => {
    expect(resolveProductHeaderAction("/dizayn-cheloveka/rasschitat")?.desktopLabel).toBe("Рассчитать бодиграф");
    expect(resolveProductHeaderAction("/dizayn-cheloveka/rasschitat")?.target).toBe("#hd-calculator");
    expect(resolveProductHeaderAction("/dizayn-cheloveka")?.target).toBe("/dizayn-cheloveka/rasschitat#hd-calculator");
    expect(resolveProductHeaderAction("/dizayn-cheloveka/tipy")?.target).toBe("/dizayn-cheloveka/rasschitat#hd-calculator");
    expect(resolveProductHeaderAction("/aura/cveta")?.target).toBe("/aura#aura-calculator");
    expect(resolveProductHeaderAction("/gadanie-po-ladoni/linii")?.target).toBe("/gadanie-po-ladoni#palm-calculator");
    expect(resolveProductHeaderAction("/natalnaya-karta/sovmestimost")?.target).toBe("/natalnaya-karta#natal-calculator");
    expect(resolveProductHeaderAction("/natalnaya-karta")?.mobileLabel).toBe("Карта");
    expect(resolveProductHeaderAction("/numerology/matrica-sovmestimosti")?.mobileLabel).toBe("Пара");
    expect(resolveProductHeaderAction("/numerology")?.target).toBe("/?numerolog=1");
    expect(resolveProductHeaderAction("/")).toBeNull();
    expect(resolveAuthProduct("/gadanie-po-ladoni?resume=1")).toBe("palm");
    expect(resolveAuthProduct("/?photo=1&mode=mark")).toBe("photo");
    expect(authProductCopy("/numerology/destiny-matrix").title).toContain("Матрицу судьбы");
    const registration = read("src/components/auth/RegistrationHeader.tsx");
    expect(registration).toContain("sanitizeReturnTo(");
  });

  it("ranks the intended Russian city first and hides raw country codes in display", () => {
    const places = rankBirthPlaces([
      { label: "Moscow, Idaho, US", latitude: 46.7, longitude: -117 },
      { label: "Москва, Москва, RU", latitude: 55.7, longitude: 37.6 },
    ], "Москва");
    expect(places[0]?.label).toContain("Москва");
    expect(formatBirthPlaceLabel(places[0]!.label)).toBe("Москва, Москва, Россия");
    expect(formatBirthPlaceLabel("Moscow, 48, RU")).toBe("Moscow, Россия");
    expect(formatBirthPlaceLabel("Berlin, 16, DE")).toBe("Berlin, Германия");
  });

  it("resets the guest Tarot surface before Photo opens and restores the Photo landing on close", () => {
    const home = read("src/components/HomePage.tsx");
    const open = home.slice(home.indexOf("const openPhotoReading"), home.indexOf("const openMarkCards"));
    const close = home.slice(home.indexOf("const closePhotoReading"), home.indexOf("const handleBrowseDeck"));
    expect(open).toContain("resetGuestSpreadFlow");
    expect(open.indexOf("resetGuestSpreadFlow")).toBeLessThan(open.indexOf("setPhotoReadingOpen(true)"));
    expect(close).toContain("restorePhotoLandingOnClose");
  });

  it("keeps the current product primary in the global header", () => {
    const header = read("src/components/GlobalAppTopHeader.tsx");
    expect(header).toContain("resolveProductHeaderAction");
    expect(header).toContain("primaryActionLabel=");
    expect(header).toContain("primaryActionMobileLabel=");
    expect(header).toContain('productAction.target?.startsWith("#")');
    expect(header).toContain('prefers-reduced-motion: reduce');
  });

  it("routes a new HD guest to registration and keeps login as a secondary choice", () => {
    const panel = read("src/components/human-design/HdReportPanel.tsx");
    const guestStart = panel.lastIndexOf("if (!authenticated)");
    const guest = panel.slice(guestStart, panel.indexOf("if (generatingBlock", guestStart));
    expect(guest).toContain("/auth/user/register");
    expect(guest).toContain("Уже есть аккаунт?");
    expect(panel).toContain("Показать все разделы");
    expect(guest).toContain("{modulesCard}");
    expect(guest.indexOf("/auth/user/register")).toBeLessThan(guest.indexOf("{modulesCard}"));
  });

  it("does not mistake an incomplete profile for a logged-out HD account", () => {
    const calculator = read("src/components/human-design/HdCalculator.tsx");
    expect(calculator).toContain("const [authenticated, setAuthenticated]");
    expect(calculator).toContain("authenticated={authenticated}");
    expect(calculator).toContain("accountReady &&");
    expect(calculator).toContain("!readHdClaimToken(result.fingerprint)");
    expect(calculator).not.toContain("authenticated={accountReady}");
  });

  it("shows the current product CTA before cross-product recommendations", () => {
    const checks = [
      ["src/components/numerolog/DestinyMatrixPreview.tsx", "data-primary-conversion", "<CrossProductNextSteps"],
      ["src/components/natal/NatalGuestCalculator.tsx", "data-primary-conversion", "<CrossProductNextSteps"],
      ["src/components/human-design/HdCalculator.tsx", "<HdReportPanel", "<CrossProductNextSteps"],
    ] as const;
    for (const [file, primary, cross] of checks) {
      const src = read(file);
      expect(src.indexOf(primary), file).toBeGreaterThan(-1);
      expect(src.indexOf(cross), file).toBeGreaterThan(src.indexOf(primary));
    }
  });

  it("opens a purchased Palm report and exposes flow errors to assistive tech", () => {
    const palm = read("src/components/palm/PalmReadingFlow.tsx");
    expect(palm).not.toContain('<summary className="cursor-pointer text-sm text-white/80">Полный разбор</summary>');
    expect(palm).toMatch(/error && <p[^>]+role="alert"/);
  });

  it("uses one Photo full-report conversion action", () => {
    const photo = read("src/components/PhotoReadingFlow.tsx");
    const preview = read("src/components/PhotoSpreadPreview.tsx");
    expect(photo.match(/Создать аккаунт и продолжить/g)).toHaveLength(1);
    expect(photo).toContain('continueThroughAuth("login")');
    expect(photo).toContain("nothing to preload before the guest can add the first symbol");
    expect(preview).toContain("onFacesReadyChange?.(true)");
    expect(photo).not.toContain('if (!isLoggedIn) return;\n    if (runesBlocked) return;');
    expect(photo).toContain('className="relative shrink-0"');
    expect(photo).toContain('className="flex h-11 w-11 shrink-0');
    expect(photo).not.toContain('aria-label="Закрыть"\n            />');
  });

  it("uses task-oriented Natal workspace labels", () => {
    const workspace = read("src/components/natal/AstrologyWorkspace.tsx");
    expect(workspace).toContain('label: "Моя карта"');
    expect(workspace).toContain('label: "Западный разбор"');
    expect(workspace).toContain('label: "Ведический разбор"');
    expect(workspace).toContain('label: "Мои отчёты"');
  });

  it("keeps primary mobile touch targets at least 44px high", () => {
    const globals = read("src/app/globals.css");
    const hd = read("src/components/human-design/HdCalculator.tsx");
    const photoCss = read("src/styles/photo-flow.css");
    const tarot = read("src/components/GuestTripletDraw.tsx");
    expect(globals.slice(globals.indexOf(".btn-luxe--sm"), globals.indexOf(".btn-luxe--md"))).toContain("min-h-11");
    expect(hd.match(/min-h-11 rounded-full/g)).toHaveLength(2);
    expect(photoCss.slice(photoCss.indexOf(".photo-flow-hint button"), photoCss.indexOf(".photo-flow-preview-shell"))).toContain("min-height: 44px");
    expect(tarot).toContain('className="mb-4 inline-flex min-h-11');
  });

  it("avoids expected guest HTTP errors and gates paid actions until claims finish", () => {
    const middleware = read("src/middleware.ts");
    const session = read("src/lib/useSession.ts");
    const palm = read("src/components/palm/PalmReadingFlow.tsx");
    const aura = read("src/components/aura/AuraReadingFlow.tsx");
    expect(middleware).toContain('"/api/stats/public"');
    expect(session).toContain('if (!authState.isLoggedIn && !isAgeGateConfirmed())');
    expect(palm).toMatch(/if \(isLoggedIn\) \{\s+void fetch\("\/api\/runes\/balance"/);
    expect(aura).toContain('setClaimStatus("claiming")');
    expect(aura).toContain('data?.code === "NO_CLAIM_TOKEN"');
    expect(aura).not.toContain('data.claimed === true || isLoggedIn');
    expect(aura).toContain("Повторить сохранение");
  });

  it("returns Natal to its report choice and labels destructive Matrix replacement", () => {
    const claim = read("src/app/api/natal-chart/claim/route.ts");
    const workspace = read("src/components/natal/AstrologyWorkspace.tsx");
    const matrix = read("src/components/numerolog/DestinyMatrixPreview.tsx");
    expect(claim).toContain("natalClaimed=1&tab=western");
    expect(workspace).toContain('search.get("natalClaimed") === "1"');
    expect(matrix).toContain("Удалить старый разбор и создать новый");
    expect(matrix).toContain("Повторить сохранение");
  });
});
