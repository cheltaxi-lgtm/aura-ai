import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateHdChart } from "@/lib/human-design/calculate";
import { hdLongitudesAt } from "@/lib/human-design/ephemeris";
import { hdFingerprint } from "@/lib/human-design/fingerprint";
import { variableSummary } from "@/lib/human-design/chart-extras";
import { computeHdFacts } from "@/modules/pro/adapters/chart-facts";
import { buildHdLockedContract } from "@/lib/hd-report-pipeline/contract";
import { validateHdReportText } from "@/lib/hd-report-quality/validator";
import { formatHdChatSummary, formatHdEvidence } from "@/lib/human-design/prompt";

const birth = { birthDate: "1987-04-03", birthTime: "14:00", timezone: "Asia/Yekaterinburg" };
const chart = calculateHdChart(birth);
const contract = buildHdLockedContract(chart);
const good = readFileSync("scripts/fixtures/hd-live-svetlana-sectional.md", "utf8").replace(/\r\n/g,"\n");

describe("HD deep audit calculation regressions", () => {
  it("true node stays within one arcminute of independent Swiss anchors", () => {
    // Swiss Ephemeris 2.10.03, astro.com/swetest, -pt -eswe, retrieved 2026-10-02.
    const anchors = [[2435148.5,274.5270406],[2448057.957638889,308.1213312],[2441256.707638889,310.2153435],
      [2451544.0833333335,123.9980126],[2446546.390972222,29.9859706],[2432650.71875,44.1334753],
      [2455551.5416666665,272.7362456],[2451544.0868055555,123.9978722],[2442594.5208333335,240.2002735],
      [2460369.8229166665,15.9851798],[2433282.75,12.5225463],[2433284.1666666665,12.2555513],
      [2433336.5416666665,7.8847732],[2433472.5,1.6628382],[2433569.9166666665,358.1867619],
      [2446081.875,55.6915685],[2435061.884564518,276.4196054],[2447967.4552968186,315.6199106],
      [2441166.590905315,314.5585887],[2451456.627576063,131.3099112],[2446458.1110282056,34.0618795],
      [2432563.0621775007,51.5680754],[2455463.694276975,277.9830169],[2451456.6311679133,131.3098549],
      [2442503.438489212,242.1681936],[2460283.148928273,23.637955],[2433195.3546642745,16.6523223],
      [2433196.818536674,16.6483952],[2433249.9111130345,15.4786071],[2433381.1126225153,7.391842],
      [2433479.1081284485,0.5452587],[2445994.914517467,57.7532063]];
    for (const [jd,node] of anchors) {
      const actual = hdLongitudesAt(jd!).northNode;
      expect(Math.abs(((actual - node! + 540) % 360) - 180) * 60, `JD ${jd}`).toBeLessThan(1);
    }
    const boundary = calculateHdChart({birthDate:"1903-05-21",birthTime:"12:00",timezone:"UTC"});
    expect(boundary.personality.find(a=>a.body==="northNode")).toMatchObject({gate:48,line:6});
  });
  it("refined 88-degree design arc resolves Moon line boundaries", () => {
    for (const [date,gate,line] of [["2000-10-18",55,3],["2001-09-04",14,2],["2001-10-12",51,5]] as const) {
      expect(calculateHdChart({birthDate:date,birthTime:"12:00",timezone:"UTC"}).designActivations.find(a=>a.body==="moon")).toMatchObject({gate,line});
    }
  });
  it("preserves seconds and both real fold occurrences in Pro facts", () => {
    const input={birthDate:"2024-11-03",birthTime:"01:30:20",timezone:"America/New_York",timeKnown:true};
    for (const occurrence of ["earlier","later"] as const) {
      const facts=computeHdFacts({...input,birthTimeOccurrence:occurrence});
      expect(facts.ok).toBe(true);
      const actual=calculateHdChart({...input,birthTimeOccurrence:occurrence});
      expect(actual.birth.utcIso).toBe(occurrence==="earlier"?"2024-11-03T05:30:20.000Z":"2024-11-03T06:30:20.000Z");
    }
    const regular={...birth,placeName:"Екатеринбург",lat:56.84,lon:60.61};
    expect(hdFingerprint({...regular,birthTimeOccurrence:"earlier"})).toBe(hdFingerprint({...regular,birthTimeOccurrence:"later"}));
    expect(hdFingerprint({...regular,birthTime:"14:00:20"})).not.toBe(hdFingerprint(regular));
  });
  it("does not certify unknown-time fields from matching hourly endpoints", () => {
    for (const [date,field] of [["2024-02-08","typeStable"],["2021-12-08","authorityStable"],["2024-07-27","typeStable"]] as const) {
      const unknown=calculateHdChart({birthDate:date,birthTime:null,timezone:"UTC"});
      expect(unknown.stability?.[field]).toBe(false);
      expect(formatHdChatSummary(unknown).split("\n")[0]).toContain("условной");
      expect(formatHdEvidence(unknown).split("\n")[0]).toContain("неизвестно");
      expect(formatHdEvidence(unknown)).not.toContain("Активации с color/tone/base");
    }
  });
  it("derives all four Variable arrows from the correct Tone sources", () => {
    const changed=structuredClone(chart);
    const activation=(side:typeof changed.personality,body:string)=>side.find(a=>a.body===body)!;
    activation(changed.designActivations,"sun").color=6; activation(changed.designActivations,"sun").tone=1;
    activation(changed.designActivations,"northNode").tone=6;
    activation(changed.personality,"northNode").tone=2;
    activation(changed.personality,"sun").color=1; activation(changed.personality,"sun").tone=5;
    expect(variableSummary(changed).variables.map(v=>[v.key,v.direction])).toEqual([
      ["determination","left"],["environment","right"],["perspective","left"],["motivation","right"]]);
  });
});

describe("HD deep audit report quality regressions", () => {
  const quality=(text:string,scope:"report"|"section"="section")=>validateHdReportText(text,{contract,scope,requireFocusAnswer:scope==="report"});
  it("provides the actual indirect motor path and rejects invented direct channel endpoints",()=>{
    expect(contract.contractBlock).toContain("Эго (Сердце) —[26-44]→ Селезёночный —[16-48]→ Горловой");
    for(const claim of [
      "В карте есть один моторный центр — Эго, соединённый с Горловым через канал 25–51.",
      "Канал 25–51 соединяет Эго и Горловой центр.",
      "Канал 51–25 связывает Сердечный и Горловой центры.",
      "Канал 25–51 находится между G-центром и Горловым.",
    ]) expect(quality(`## Тип и его особенности\n${claim}`).findings.some(f=>f.detail.startsWith("wrong_channel_endpoints:"))).toBe(true);
    for(const claim of [
      "Канал 25–51 соединяет Эго и G-центр.",
      "Канал 25–51 соединяет Эго и G-центр, а Горловой участвует в выражении через другие каналы.",
      "Канал 25–51 не соединяет Эго с Горлом.",
      "Канал 25–51 нельзя считать соединением Эго и Горла.",
      "Эго связан с Горловым через цепочку каналов 26–44 и 16–48.",
    ]) expect(quality(`## Тип и его особенности\n${claim}`).findings.some(f=>f.detail.startsWith("wrong_channel_endpoints:"))).toBe(false);
  });
  it("does not assign sixth-line age phases to a known or conditional profile without six",()=>{
    const unknown=calculateHdChart({birthDate:"1988-07-07",birthTime:null,timezone:"Asia/Yekaterinburg"});
    expect(unknown.profile).toBe("1/3");
    const ownContract=buildHdLockedContract(unknown);
    expect(ownContract.contractBlock).toContain("Профиль НЕ содержит шестую линию");
    for(const timeKnown of [false,true]) {
      const q=(text:string)=>validateHdReportText(`## Периоды и темы жизни\n${text}`,{contract:{...ownContract,timeKnown},scope:"section"});
      expect(q("У шестой линии условного профиля обычно рассматривают три широкие фазы. Сейчас, в 38 лет, Ольга находится внутри этого диапазона 30–50.").findings.some(f=>f.detail.includes("without_sixth_profile"))).toBe(true);
      expect(q("Ваш профиль имеет шестую линию. Вы на крыше.").findings.some(f=>f.detail.includes("without_sixth_profile"))).toBe(true);
      expect(q("У людей с шестой линией бывает период на крыше. Сейчас вы находитесь в фазе 30–50.").findings.some(f=>f.detail.includes("without_sixth_profile"))).toBe(true);
      expect(q("У людей с шестой линией бывает период на крыше. Сейчас вы не находитесь на крыше: в Вашем профиле 1/3 шестой линии нет.").findings.some(f=>f.detail.includes("without_sixth_profile"))).toBe(false);
      expect(q("Профиль 1/3 отличается от профиля с шестой линией. Ваш путь строится через исследование и проверку опытом.").findings.some(f=>f.detail.includes("without_sixth_profile"))).toBe(false);
      expect(q("Профиль 1/3 отличается от профиля с шестой линией. Сейчас Вы в фазе исследования новых возможностей через первую линию.").findings.some(f=>f.detail.includes("without_sixth_profile"))).toBe(false);
      expect(q("У людей с шестой линией существуют три возрастные фазы. Сейчас речь идёт о фазе накопления опыта первой линии Вашего профиля 1/3.").findings.some(f=>f.detail.includes("without_sixth_profile"))).toBe(false);
      expect(q("У шестой линии фаза 30–50 называется наблюдением. Сейчас Вы находитесь внутри этого диапазона.").findings.some(f=>f.detail.includes("without_sixth_profile"))).toBe(true);
    }
  });
  it("keeps each planet's CTB local and does not call an undefined center defined",()=>{
    for(const [side,activations] of [["Личности",chart.personality],["Дизайна",chart.designActivations]] as const){
      const sun=activations.find(a=>a.body==="sun")!,moon=activations.find(a=>a.body==="moon")!;
      for(const separator of [";",","]){
        const text=`## Бизнес и работа\nСолнце ${side}: ${sun.gate}.${sun.line}${separator} Луна ${side}: ${moon.gate}.${moon.line}, цвет ${moon.color}, тон ${moon.tone}, база ${moon.base}.`;
        expect(quality(text).findings.filter(f=>f.detail.startsWith("wrong_activation:"))).toEqual([]);
      }
    }
    expect(quality("## Девять центров\nВаш центр Солнечного сплетения не определён. Ваше неопределённое Солнечное сплетение открыто.").findings.filter(f=>f.detail.startsWith("false_defined_center:"))).toEqual([]);
    expect(quality("## Девять центров\nВаш неопределённый Сакральный центр открыт.").findings.filter(f=>f.detail.startsWith("false_defined_center:"))).toEqual([]);
  });
  it("allows correct other-type comparisons without exempting explicit personal facts",()=>{
    const q=quality(good+"\nВ отличие от Генератора с сакральным авторитетом, у Вас селезёночный авторитет.","report");
    expect(q.findings).toEqual([]);
  });
  it("allows personal angle negation and future profile phases",()=>{
    for(const text of ["Ваш инкарнационный крест не Левый угол, а Прямой угол.","Ваш угол — не Левый угол.","Ваш инкарнационный крест не левоугольный, а прямоугольный.","Ваш инкарнационный крест прямоугольный, в отличие от левоугольного.","Ваш инкарнационный крест не относится к левому углу.","Ваш инкарнационный крест — прямого угла."]){expect(quality(`## Бизнес и работа\n${text}`).findings.filter(f=>f.detail.startsWith("wrong_cross_angle:"))).toEqual([]);}
    const dated=buildHdLockedContract(chart,{referenceDate:"2026-10-02"});
    expect(dated.ageYears).toBe(39);
    expect(validateHdReportText("## Профиль\nСейчас, в фазе Ролевой модели (после 50), Вы осмысляете опыт.",{contract:dated,scope:"section"}).findings.some(f=>f.detail.startsWith("false_current_profile_phase:"))).toBe(true);
    expect(validateHdReportText("## Профиль\nПозже, в фазе Ролевой модели после 50, Вы сможете осмыслить опыт.",{contract:dated,scope:"section"}).findings.filter(f=>f.detail.startsWith("false_current_profile_phase:"))).toEqual([]);
  });
  it("allows another person angle while retaining separate personal checks",()=>{
    for(const text of ["Левоугольный крест другого человека отличается от Вашего прямоугольного креста.","Крест левого угла у другого человека отличается от Вашего прямоугольного креста."]){
      expect(quality(good+"\n"+text,"report").findings).toEqual([]);
      expect(quality(good+"\n"+text+" Ваш инкарнационный крест — левого угла.","report").findings.some(f=>f.detail.startsWith("wrong_cross_angle:"))).toBe(true);
    }
  });
  it("accepts balanced emphasis and blocks an unmatched final marker",()=>{
    expect(quality(good+"\n**Вы можете опираться на собственное наблюдение.**","report").findings).toEqual([]);
    expect(quality(good+"\nНезавершённая разметка *","report").findings.some(f=>f.detail==="junk:unmatched_emphasis")).toBe(true);
  });
  it("keeps the substantive successful report valid", () => {
    expect(quality(good,"report").findings).toEqual([]);
  });
  it("rejects a long report consisting of only one section", () => {
    const q=quality(`## Ответ на ваш запрос\nВы — Манифестор. ${good.slice(0,16000)}`.replace(/^##(?! Ответ)/gm,"###"),"report");
    expect(q.findings.some(f=>f.detail.startsWith("missing_section:"))).toBe(true);
  });
  it.each([
    ["В отличие от Генератора, Ваш инкарнационный крест: Левый угол.","wrong_cross_angle"],
    ["В отличие от Генератора, **Ваш инкарнационный крест: Левый угол**.","wrong_cross_angle"],
    ["В отличие от Генератора, Ваше **Солнечное сплетение определено**.","false_defined_center:solar"],
    ["Ваш инкарнационный крест — левого угла.","wrong_cross_angle"],
    ["Ваш инкарнационный крест относится к левому углу.","wrong_cross_angle"],
    ["В отличие от Генератора, Ваш крест — левого угла.","wrong_cross_angle"],
    ["Ваш инкарнационный крест — левоугольный.","wrong_cross_angle"],
    ["В отличие от Генератора, Ваш инкарнационный крест — левоугольного типа.","wrong_cross_angle"],
    ["Ваш инкарнационный крест — джакстапозиционный.","wrong_cross_angle"],
    ["Ваш центр Солнечного сплетения определён.","false_defined_center:solar"],
    ["Ваше Солнечное сплетение определено.","false_defined_center:solar"],
    ["В отличие от Генератора, Ваш центр Солнечного сплетения определён.","false_defined_center:solar"],
    ["Авторитет — сакральный.","wrong_authority:sacral"],
    ["Ваш авторитет является сакральным.","wrong_authority:sacral"],
    ["В отличие от Генератора, Вы — Проектор.","wrong_type_asserted"],
    ["В отличие от Проектора, Ваш авторитет является сакральным.","wrong_authority:sacral"],
    ["В отличие от Генератора, Ваш внутренний авторитет — сакральный.","wrong_authority:sacral"],
    ["В отличие от Проектора, Ваше Солнце Личности в воротах 2, линия 5.","wrong_activation:personality:sun:gate"],
    ["Стратегия Проектора — ждать приглашения, Ваш профиль составляет 1/3.","wrong_profile:1/3"],
    ["Ваш Горловой центр является неопределённым.","false_open_center:throat"],
    ["Ваш профиль составляет 1/3.","wrong_profile:1/3"],
    ["Ваш инкарнационный крест — Прямоугольный крест Спящего Феникса.","wrong_cross_name"],
    ["Ваше ложное «Я» — разочарование.","wrong_notSelf"],
    ["Ваша подпись — успех.","wrong_signature"],
    ["Определённость — двойная.","wrong_definition"],
    ["Ваш профиль — 1/3.","wrong_profile:1/3"],
    ["Ваш Горловой центр открыт.","false_open_center:throat"],
    ["Ваше Солнце Личности находится в воротах 2, линия 5.","wrong_activation:personality:sun:gate"],
    ["Ваше Солнце Дизайна: ворота 64, линия 5, цвет 6, тон 6, база 5.","wrong_activation:design:sun:"],
    ["Ваш Сакральный центр определён.","false_defined_center:sacral"],
    ["Ваш определённый канал 34-20.","false_defined_channel:20-34"],
    ["Висящие ворота 5, 20 и 64.","false_hanging_gate:20"],
    ["Вы Генератор.","wrong_type_asserted"],
    ["Инкарнационный крест: Прямой угол — «Спящего Феникса».","wrong_cross_name"],
  ])("rejects explicit contradictory facts: %s", (text,detail)=>{
    expect(quality(`## Бизнес и работа\n${text}`).findings.some(f=>f.detail.includes(detail))).toBe(true);
  });
  it("does not allow a prior comparison to excuse wrong strategy in another sentence", () => {
    expect(quality("## Стратегия\nВ отличие от Проектора мы начинаем сами. Ждите приглашения перед работой.").findings.some(f=>f.rule==="V9")).toBe(true);
    expect(quality("## Стратегия\nВам не нужно ждать приглашения. Стратегия Проектора — ждать приглашения; ваша — информировать.").findings.some(f=>f.rule==="V9")).toBe(false);
  });
  it("returns both affected sections for duplication, and no global missing-title errors locally", () => {
    const body=good.split("## Стратегия\n")[1]!.split("\n## ")[0]!;
    const q=quality(`## Стратегия\n${body}\n## Авторитет\n${body}`);
    expect(q.findings.find(f=>f.detail.startsWith("shingle_overlap:"))?.sectionTitles).toEqual(["Стратегия","Авторитет"]);
    expect(q.findings.some(f=>f.detail.startsWith("missing_section:"))).toBe(false);
  });
});
