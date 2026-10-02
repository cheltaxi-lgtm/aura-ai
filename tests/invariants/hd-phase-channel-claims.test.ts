import { describe, expect, it } from "vitest";
import { calculateHdChart } from "@/lib/human-design/calculate";
import { buildHdLockedContract } from "@/lib/hd-report-pipeline/contract";
import { validateHdReportText } from "@/lib/hd-report-quality/validator";
import { buildHdCompositeReportSystemPrompt } from "@/lib/human-design/prompt";

const chart=calculateHdChart({birthDate:"1987-04-03",birthTime:"14:00",timezone:"Asia/Yekaterinburg"});
const contract=buildHdLockedContract(chart,{referenceDate:"2026-10-02"});
function findings(text: string, title="Периоды и темы жизни") {
  return validateHdReportText(`## ${title}\n${text}`,{contract,scope:"section"}).findings.filter(f=>f.rule==="V4"||f.rule==="V5"||f.rule==="V10");
}

describe("HD actual consumer phase and channel claims",()=>{
  it.each(["13–33","13—33","13-33","13/33","13 и 33"])("checks saved channel ownership in every supported notation: %s",pair=>{
    expect(findings(`Ваш определённый канал ${pair} соединяет G-центр с Горловым.`,"Бизнес и работа").some(f=>f.detail==="false_defined_channel:13-33")).toBe(true);
  });
  it.each(["16–48, 25–51, 26–44","16—48, 25—51, 26—44","16/48, 25/51, 26/44","16 и 48, 25 и 51, 26 и 44"])("accepts all saved channels in supported notation: %s",pairs=>{
    const result=validateHdReportText(`## Каналы\nВаши каналы ${pairs}.`,{contract,scope:"section"});
    expect(result.findings.filter(f=>/false_defined_channel|missing_defined_channel/.test(f.detail))).toEqual([]);
  });
  it.each([
    "Период примерно от 30 до 50 лет связан с четвёртой линией — Оппортунистом. Сейчас, в 39 лет, это основная линза развития.",
    "Вторая фаза 30–50 — четвёртая линия.",
    "Период 30—50 лет принадлежит второй линии.",
    "После 50 это фаза пятой линии.",
    "Четвёртая линия проходит фазу 30–50.",
    "Фаза четвёртой линии длится примерно от 30 до 50 лет.",
  ])("rejects another line owning the sixth-line age phase: %s",text=>{
    expect(findings(text).some(f=>f.detail==="wrong_sixth_line_phase_owner")).toBe(true);
    expect(findings(text).find(f=>f.detail==="wrong_sixth_line_phase_owner")?.sectionTitles).toEqual(["Периоды и темы жизни"]);
  });
  it.each([
    "Период 30–50 лет связан с шестой линией — это наблюдение на крыше. Четвёртая линия продолжает проявляться через доверие и окружение.",
    "В возрасте 30–50 лет шестая линия наблюдает, а четвёртая линия действует через сеть знакомых.",
    "Период 30–50 не связан с четвёртой линией; её темы действуют всю жизнь.",
    "Период 30–50 — не фаза четвёртой линии, а наблюдение шестой линии.",
    "Период 30–50 принадлежит шестой линии, при этом четвёртая линия продолжает строить связи.",
    "До 30 лет шестая линия проживает опыт подобно третьей линии; после примерно 50 может раскрыться Ролевая модель.",
  ])("allows accurate lifelong profile traits and phase comparisons: %s",text=>{
    expect(findings(text).filter(f=>f.detail==="wrong_sixth_line_phase_owner")).toEqual([]);
  });
  it.each([
    "Ворота 30 и 29 образуют канал Сияния между Эмоциональным и Корневым центрами.",
    "Дизайн-Солнце в воротах 30 и Земля в воротах 29 образуют канал 30–41 между Эмоциональным и Корневым центрами.",
    "Ворота 29 и 30 формируют полный канал.",
  ])("rejects invented constituent gates even with a correct channel ID: %s",text=>{
    expect(findings(text,"Инкарнационный крест").some(f=>f.detail.startsWith("invalid_channel_constituent_gates:29-30"))).toBe(true);
  });
  it("checks constituent gate identity against an explicit channel",()=>{
    expect(findings("Ворота 13 и 33 образуют канал 30–41.","Автоматические реакции").some(f=>f.detail.startsWith("wrong_channel_constituent_gates:"))).toBe(true);
  });
  it.each(["Канал 29/30 описывает близость.","Канал 29 и 30 описывает близость."])("rejects nonexistent channel pairs in every supported notation: %s",text=>{
    expect(findings(text,"Каналы").some(f=>f.detail==="invalid_channel_pair:29-30")).toBe(true);
  });
  it.each(["Канал 25/51 соединяет Эго и Горловой.","Канал 25 и 51 соединяет Эго и Горловой."])("checks endpoints in every supported notation: %s",text=>{
    expect(findings(text,"Каналы").some(f=>f.detail==="wrong_channel_endpoints:25-51")).toBe(true);
  });
  it.each([
    "Канал 6/59 соединяет Сакральный и Эмоциональный центры.",
    "Канал 6 и 59 соединяет Сакральный и Эмоциональный центры.",
    "Канал 25/51 соединяет Эго и G-центр.",
    "Канал 25 и 51 соединяет Эго и G-центр.",
  ])("allows correct pairs and endpoints in every supported notation: %s",text=>{
    expect(findings(text,"Каналы").filter(f=>/invalid_channel|wrong_channel_endpoints/.test(f.detail))).toEqual([]);
  });
  it.each([
    "Ворота 30 и 41 образуют канал 30–41 между Эмоциональным и Корневым центрами.",
    "Дизайн-Солнце в воротах 30 и Земля в воротах 29 не образуют канал 30–41. Канал 30–41 образован воротами 30 и 41.",
    "Ворота 29 и 30 не образуют канал. У ворот 29 гармоничные ворота 46, у ворот 30 — 41.",
    "Ворота 29 и 30 не образуют канал 29–30. Канал 29–30 не существует.",
    "«Канал 29–30» — ошибка. Ворота 29 и 30 относятся к разным каналам.",
    "Ворота 29 и 30 нельзя считать образующими канал.",
    "Канал 29–30 не является настоящим каналом.",
    "Ворота 29 и 30 имеют разные темы, а ворота 13 и 33 образуют канал 13–33.",
    "В период 30–50 канал 13–33 продолжает работать.",
    "При профиле 4–6 канал 13–33 соединяет G-центр и Горловой центр.",
    "Канал 13–33 указан в карте на дату 2026-10-02.",
  ])("preserves valid channel formation and negation: %s",text=>{
    expect(findings(text,"Инкарнационный крест").filter(f=>/constituent|invalid_channel|endpoints/.test(f.detail))).toEqual([]);
  });
  it.each([
    "G-центр определён. Каналы 13–33 и 23–43 связывают его с Горловым через устойчивые темы памяти, осмысления и выражения опыта.",
    "G-центр определён. Он связан с ощущением направления, идентичности и собственного способа быть в мире. Каналы 13–33 и 23–43 связывают его с Горловым через устойчивые темы памяти, осмысления и выражения опыта.",
    "Каналы 13–33 и 23–43 связывают G-центр с Горловым центром.",
    "Эго определён. Каналы 13–33 и 23–43 связывают его с Горловым.",
  ])("checks every direct channel in a list and a bounded pronoun antecedent: %s",text=>{
    expect(findings(text,"Девять центров").some(f=>f.detail==="wrong_channel_endpoints:23-43")).toBe(true);
  });
  it.each([
    "G-центр определён. Канал 13–33 связывает его с Горловым. Канал 23–43 соединяет Аджну и Горловой.",
    "Каналы 13–33 и 23–43 соединяют G-центр и Аджну с Горловым центром.",
    "Канал 30–41 соединяет Эмоциональный и Корневой центры.",
    "G-центр определён. Каналы 13–33 и 23–43 не связывают его с Горловым напрямую.",
    "Эго связан с Горловым через цепочку каналов 26–44 и 16–48.",
  ])("allows different network links, negation and indirect channel chains: %s",text=>{
    expect(findings(text,"Девять центров").filter(f=>f.detail.startsWith("wrong_channel_endpoints:"))).toEqual([]);
  });
  it.each(["companionship","COMPANIONSHIP","Companionship"])("rejects an internal connection label in any case and gives the affected section: %s",label=>{
    expect(findings(`Общих каналов ${label} в этой связи нет.`,"Общие каналы и язык близости")).toContainEqual({rule:"V5",detail:"internal_connection_label",sectionTitles:["Общие каналы и язык близости"]});
  });
  it("does not seed forbidden internal connection labels in the system prompt",()=>{
    const prompt=buildHdCompositeReportSystemPrompt("Алексей","Анна","Партнёрство");
    expect(prompt).not.toMatch(/dominance[AB]|compromise[AB]|aOnly|bOnly|companionship/iu);
    expect(prompt).toContain("Называй механики связи по-русски");
  });
  it("locks the three phase themes and cross/channel distinction in the prompt",()=>{
    expect(contract.contractBlock).toContain("ВСЕ три возрастные фазы принадлежат шестой линии");
    expect(contract.contractBlock).toContain("Четыре ворота инкарнационного креста НЕ образуют автоматически два канала");
  });
});
