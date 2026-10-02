import { describe, expect, it } from "vitest";
import { calculateHdChart } from "@/lib/human-design/calculate";
import { buildHdLockedContract } from "@/lib/hd-report-pipeline/contract";
import { buildHdConnectionReportContract, formatHdConnectionEvidence } from "@/lib/human-design/connection";
import { validateHdReportText } from "@/lib/hd-report-quality/validator";

const a = calculateHdChart({birthDate:"1987-04-03",birthTime:"14:00",timezone:"Asia/Yekaterinburg"});
const b = calculateHdChart({birthDate:"1990-05-15",birthTime:"14:30",timezone:"Asia/Yekaterinburg"});
const unknown = calculateHdChart({birthDate:"1988-07-07",birthTime:null,timezone:"Asia/Yekaterinburg"});
const contract = buildHdLockedContract(unknown);
const connection = buildHdConnectionReportContract(a,b,{a:"Алексей",b:"Анна"});
const groups = (text:string) => validateHdReportText(`## Определённость и самодостаточность\n${text}`,{contract,scope:"section"}).findings.filter(f=>f.detail.startsWith("wrong_definition_group"));
const counts = (text:string) => validateHdReportText(`## Доминантность и компромисс\n${text}`,{connectionContract:connection,scope:"section"}).findings.filter(f=>f.detail.startsWith("wrong_connection_") || f.detail === "internal_connection_label");

describe("HD saved graph and connection prose consistency",()=>{
  it("locks the complete components of an unknown-time chart, including the throat-connected solar center",()=>{
    expect(contract.definitionComponents.map(c=>[...c].sort()).sort()).toEqual([["g","heart","solar","spleen","throat"],["root","sacral"]].sort());
    expect(contract.contractBlock).toContain("Группы связанных определённых центров: 2");
    expect(contract.contractBlock).toContain("При неизвестном времени это группы условной карты");
    const actual = "Одна часть связана с G-центром, Горловым, Селезёночным и Эго через 10–20, 10–57, 20–57, 25–51. Другая часть включает Эмоциональный, Сакральный и Корневой центры через 35–36 и 42–53. Обе группы определены.";
    expect(groups(actual)).toEqual(expect.arrayContaining([expect.objectContaining({rule:"V4",sectionTitles:["Определённость и самодостаточность"]})]));
  });
  it.each([
    "Группа 2: Эмоциональный, Сакральный, Корневой.",
    "Первая группа включает Сакральный и Корневой центры через 35–36.",
    "Одна группа объединяет G-центр и Корневой центр.",
  ])("rejects an invented connected component: %s",claim=>{expect(groups(claim).length).toBeGreaterThan(0);});
  it.each([
    "Первая группа включает G-центр, Горловой, Эго, Селезёночный и Эмоциональный центры через 10–20, 10–57, 20–57, 25–51, 35–36. Вторая группа включает Сакральный и Корневой центры через 42–53.",
    "Группа 1: G-центр, Горловой, Селезёночный, Эго, Эмоциональный. Группа 2: Сакральный, Корневой.",
    "Эмоциональный центр помогает принимать решения, а Сакральный и Корневой задают другой ритм. Между группами требуется внимание к взаимодействию.",
    "Первая группа включает Сакральный и Корневой центры и взаимодействует со второй группой через Эмоциональный центр.",
    "В одну группу не входят Эмоциональный, Сакральный и Корневой центры.",
    "У других людей одна группа включает Эмоциональный, Сакральный и Корневой центры.",
  ])("accepts true components, interaction, negation and another person's chart: %s",claim=>{expect(groups(claim)).toEqual([]);});
  it("handles single definition and no definition without inventing components",()=>{
    expect(buildHdLockedContract(a).definitionComponents).toHaveLength(1);
    const empty={...a,definedCenters:[],channels:a.channels.map(c=>({...c,defined:false}))};
    expect(buildHdLockedContract(empty).definitionComponents).toEqual([]);
  });
  it("bounds comparison-context work on long generated sentences",()=>{
    const started=performance.now();
    expect(groups("ин".repeat(12_000)+" Одна группа включает Эмоциональный, Сакральный и Корневой центры.").length).toBeGreaterThan(0);
    expect(performance.now()-started).toBeLessThan(1000);
  });
  it("binds dominance channel ownership and human names to actual saved chart order",()=>{
    expect(connection.dominance.map(p=>[p.name,p.channelKeys.length])).toEqual([["Алексей",3],["Анна",4]]);
    const evidence=formatHdConnectionEvidence(a,b,{a:"Алексей",b:"Анна"});
    expect(evidence).toContain("Доминантные каналы: Алексей — 3; Анна — 4. Всего — 7. Компромиссных каналов — 0.");
    expect(evidence).not.toMatch(/dominance[AB]|compromise[AB]|aOnly|bOnly/u);
    expect(counts("Семь доминантных каналов. Четыре относятся к dominanceA и три — к dominanceB.").some(f=>f.detail==="internal_connection_label")).toBe(true);
    const intro=validateHdReportText("Доминантные каналы: Алексей — 4; Анна — 3.",{connectionContract:connection,scope:"section"});
    expect(intro.findings.some(f=>f.detail.startsWith("wrong_connection_dominance_count:") && f.sectionTitles?.includes("Вступление"))).toBe(true);
  });
  it("does not confuse personal defined or common-channel counts with dominance",()=>{
    const same=buildHdConnectionReportContract(a,a,{a:"Алексей",b:"Анна"});
    expect(same.dominance.map(p=>p.channelKeys.length)).toEqual([0,0]);
    const q=validateHdReportText("## Доминантность и компромисс\nДоминантных каналов нет: все три определённые канала общие. Индивидуальная карта Алексея — 3 определённых канала, индивидуальная карта Анны — 3 определённых канала.",{connectionContract:same,scope:"section"});
    expect(q.findings.filter(f=>f.detail.startsWith("wrong_connection_"))).toEqual([]);
  });
  it("still rejects an explicit wrong count of defined dominance channels",()=>{
    expect(counts("Алексей — 4 определённых доминантных канала.").some(f=>f.detail.startsWith("wrong_connection_dominance_count:"))).toBe(true);
    expect(counts("Алексей — 4 определённых канала доминантности.").some(f=>f.detail.startsWith("wrong_connection_dominance_count:"))).toBe(true);
    expect(counts("Доминантные каналы: Алексей — 4 полных канала; Анна — 3 полных канала.").some(f=>f.detail.startsWith("wrong_connection_dominance_count:"))).toBe(true);
    expect(counts("Доминантные каналы: Алексей — 3 полных канала; Анна — 4 полных канала.")).toEqual([]);
    expect(counts("Доминантные каналы: Алексей — 3; Анна — 4; Индивидуальная карта Алексея — 3 определённых канала, индивидуальная карта Анны — 4 определённых канала.")).toEqual([]);
    for (const separator of ["\n","\n\n- "]) {
      expect(counts(`Доминантные каналы:${separator}Алексей — 4 полных канала; Анна — 3 полных канала.`).some(f=>f.detail.startsWith("wrong_connection_dominance_count:"))).toBe(true);
      expect(counts(`Доминантные каналы:${separator}Алексей — 3 полных канала; Анна — 4 полных канала.`)).toEqual([]);
      expect(counts(`Доминантные каналы:${separator}Алексей — 3; Анна — 4.\nИндивидуальная карта Алексея — 3 определённых канала, индивидуальная карта Анны — 4 определённых канала.`)).toEqual([]);
    }
  });
  it.each([
    "Алексей — 4; Анна — 3.",
    "У Алексея четыре доминантных канала. У Анны три доминантных канала.",
    "Четыре относятся к Алексею, три относятся к Анне.",
    "Всего восемь доминантных каналов.",
    "Компромиссных каналов — два.",
  ])("rejects swapped and fabricated connection counts: %s",claim=>{expect(counts(claim).length).toBeGreaterThan(0);});
  it.each([
    "Доминантные каналы: Алексей — 3; Анна — 4. Всего семь доминантных каналов. Компромиссных каналов — 0.",
    "У Алексея три доминантных канала. У Анны четыре доминантных канала.",
    "Три относятся к Алексею, четыре относятся к Анне.",
    "Алексей — 4/6. Анна — 6/2. Канал 16–48 принадлежит Алексею.",
    "Канал 16 – 48 принадлежит Алексею. Канал 25 - 51 принадлежит Алексею.",
  ])("accepts correct named counts without confusing profiles or channel numbers: %s",claim=>{expect(counts(claim)).toEqual([]);});
});
