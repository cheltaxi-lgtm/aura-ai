import { describe, expect, it } from "vitest";
import { calculateHdChart } from "@/lib/human-design/calculate";
import { formatHdBirthIdentity, formatHdEvidence } from "@/lib/human-design/prompt";
import { buildHdLockedContract } from "@/lib/hd-report-pipeline/contract";

describe("HD birth identity in evidence/contract", () => {
  it("puts exact time, timezone and place into evidence and contract", () => {
    const chart = calculateHdChart({
      birthDate: "1984-03-07",
      birthTime: "23:55",
      timezone: "Europe/Berlin",
    });
    expect(chart.timeKnown).toBe(true);

    const place = "Potsdam, Brandenburg, Germany";
    const birth = formatHdBirthIdentity(chart, { placeLabel: place });
    expect(birth).toMatch(/1984-03-07/);
    expect(birth).toMatch(/23:55/);
    expect(birth).toMatch(/ТОЧНОЕ/);
    expect(birth).toMatch(/Europe\/Berlin/);
    expect(birth).toMatch(/Potsdam/);
    expect(birth).not.toMatch(/неизвестно \(в расчёте использовано 12:00/);

    const evidence = formatHdEvidence(chart, { placeLabel: place });
    expect(evidence.startsWith("ДАННЫЕ РОЖДЕНИЯ")).toBe(true);
    expect(evidence).toContain("Potsdam");

    const contract = buildHdLockedContract(chart, { placeLabel: place });
    expect(contract.contractBlock).toContain("23:55");
    expect(contract.contractBlock).toContain("Potsdam");
  });

  it("marks unknown time explicitly when birthTime is null", () => {
    const chart = calculateHdChart({
      birthDate: "1984-03-07",
      birthTime: null,
      timezone: "Europe/Berlin",
    });
    const birth = formatHdBirthIdentity(chart, { placeLabel: "Potsdam" });
    expect(chart.timeKnown).toBe(false);
    expect(birth).toMatch(/время: неизвестно/i);
    expect(birth).toContain("Potsdam");
  });
});
