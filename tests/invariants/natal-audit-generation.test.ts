import { NATAL_REPORT_VERSION, NATAL_REPORT_SECTION_KEYS, prepareNatalReportCandidate, validateNatalReport } from "@/lib/natal/report";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NatalEvidence } from "@/lib/natal/evidence";
import { natalClaimFactErrors } from "@/lib/natal/report-fidelity";
import { generateValidatedNatalReport } from "@/lib/natal/generate-validated-report";
const mock = vi.hoisted(() => ({ text: "", pending: false }));
vi.mock("@/lib/llm", () => ({ completeChatDetailed: vi.fn(async () => mock.pending ? new Promise(() => {}) : ({ text: mock.text, finishReason: "stop" })) }));
vi.mock("@/lib/ai-model", () => ({ getNatalModel: async () => "fixture-model" }));
const factor = (value: string, overrides: Partial<NatalEvidence> = {}): NatalEvidence => ({ id: "ne.western.position.sun", label: "Солнце", value, tradition: "western", category: "identity", type: "position", confidence: "high", uncertainty: null, sourcePath: "western.sun", deepLink: "", ...overrides });
describe("Natal factual fidelity and fail-closed generation", () => {
  beforeEach(() => { mock.text = ""; mock.pending = false; });
  it("rejects wrong signs, degrees and retrograde claims, including Vedic aliases", () => {
    const evidence = [factor("Козерог · 10.00°")];
    for (const text of ["Солнце во Льве", "Солнце в Козероге на 29°", "Ретроградное Солнце в Козероге"]) expect(natalClaimFactErrors(text, evidence).length).toBeGreaterThan(0);
    const vedic = [factor("Makara (Козерог) · 10°00′", { label: "Сурья (Солнце)", tradition: "vedic" })];
    expect(natalClaimFactErrors("Солнце в Козероге", vedic)).toEqual([]);
    expect(natalClaimFactErrors("Сурья во Льве", vedic).length).toBeGreaterThan(0);
  });
  it("distinguishes transit positions and aspects from natal facts", () => {
    const natal = factor("Близнецы · 10.00°");
    const ingress = factor("Солнце: Дева → Весы · пик 2026-09-23", { id: "ne.timing.transit.sun", type: "transit", tradition: "timing", label: "Текущий транзит" });
    expect(natalClaimFactErrors("Транзитное Солнце в Весах", [natal, ingress], [ingress])).toEqual([]);
    expect(natalClaimFactErrors("Транзитное Солнце во Льве", [natal, ingress], [ingress]).length).toBeGreaterThan(0);
    const aspect = factor("Луна · Соединение · Солнце · пик 2026-09-23", { id: "ne.timing.transit.moon", type: "transit", tradition: "timing" });
    expect(natalClaimFactErrors("Транзитная Луна в оппозиции к Солнцу", [aspect]).length).toBeGreaterThan(0);
  });
  it("checks ISO, numeric and Russian calendar dates against cited factors", () => {
    const evidence = [factor("Солнце · пик 2026-10-03", { type: "transit", tradition: "timing" })];
    for (const text of ["пик 2099-10-03", "пик 03.10.2099", "пик 3 октября 2099 года"]) expect(natalClaimFactErrors(text, evidence).length).toBeGreaterThan(0);
    expect(natalClaimFactErrors("пик 3 октября 2026 года", evidence)).toEqual([]);
  });
  it("parses degree minutes and seconds and recognizes inflected Gemini", () => {
    const evidence = [factor("Kanya (Дева) · 29°50′00″", { label: "Будха (Меркурий)", tradition: "vedic" })];
    expect(natalClaimFactErrors("Меркурий в Деве 29°50′", evidence)).toEqual([]);
    expect(natalClaimFactErrors("Меркурий в Деве 29°50′00″", evidence)).toEqual([]);
    for (const text of ["Меркурий в Деве 29°00′", "Меркурий в Деве 29°50′59″", "Меркурий в Близнецах"]) expect(natalClaimFactErrors(text, evidence).length).toBeGreaterThan(0);
    const exact = [factor("Дева · 10°00′", { label: "Меркурий" })];
    expect(natalClaimFactErrors("Меркурий в Деве 10°59′", exact).length).toBeGreaterThan(0);
  });
  it("stops an unresolved provider call within the shared deadline", async () => {
    mock.pending = true;
    const started = Date.now();
    const generated = await generateValidatedNatalReport({ deadlineAt: started + 1200, baseMessages: [], evidence: [factor("Козерог · 10.00°")], tradition: "western", reportType: "interpretation", metadataDefaults: { disclaimer: "Символическая интерпретация", methodology: "Расчёт" } });
    expect(generated.ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(2200);
  });
  it("does not turn an empty model response into a paid engine template", async () => {
    const generated = await generateValidatedNatalReport({ baseMessages: [], evidence: [factor("Козерог · 10.00°")], tradition: "western", reportType: "interpretation", metadataDefaults: { disclaimer: "Символическая интерпретация", methodology: "Расчёт" } });
    expect(generated.ok).toBe(false);
  });
});


describe('Natal strict final report shape', () => {
  const evidence = [factor('Солнце · пик 2026-10-03', { type: 'transit', tradition: 'timing', category: 'timing' })];
  const candidate = () => ({ version: NATAL_REPORT_VERSION, tradition: 'western', reportType: 'forecast', horizonDays: 7, disclaimer: 'Символическая интерпретация', methodology: 'Расчёт', sections: NATAL_REPORT_SECTION_KEYS.map(key => ({ key, title: key, claims: [{ text: 'Солнце обозначает акцент периода и точку внимания.', evidenceIds: [evidence[0].id] }] })) });
  it('rejects a complete but thin eight-section paid forecast', async () => {
    const raw = candidate();
    expect(validateNatalReport(raw, evidence, 'western', 'forecast', 7).ok).toBe(true);
    mock.text = JSON.stringify(raw); mock.pending = false;
    expect((await generateValidatedNatalReport({ baseMessages: [], evidence, tradition: 'western', reportType: 'forecast', horizonDays: 7 })).ok).toBe(false);
  });
  it('preserves and rejects wrong metadata, duplicate sections and later contradictory claims', () => {
    const wrong = { ...candidate(), tradition: 'vedic', horizonDays: 30 };
    const normalized = prepareNatalReportCandidate(wrong, { tradition: 'western', reportType: 'forecast', horizonDays: 7 });
    expect(validateNatalReport(normalized, evidence, 'western', 'forecast', 7).ok).toBe(false);
    const duplicate = candidate(); duplicate.sections.push(duplicate.sections[0]);
    expect(validateNatalReport(prepareNatalReportCandidate(duplicate, { tradition: 'western', reportType: 'forecast', horizonDays: 7 }), evidence, 'western', 'forecast', 7).ok).toBe(false);
    const contradiction = candidate(); contradiction.sections[7].claims.push({ text: 'Солнце обозначает пик 2099-10-03.', evidenceIds: [evidence[0].id] });
    expect(validateNatalReport(contradiction, evidence, 'western', 'forecast', 7).ok).toBe(false);
  });
});
