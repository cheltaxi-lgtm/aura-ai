import { handcraftedScenarios } from "./handcrafted";
import { generatedScenarios } from "./generated";
import type { GoldenScenario } from "../types";

export function loadGoldenDataset(): GoldenScenario[] {
  return [...handcraftedScenarios(), ...generatedScenarios()];
}

export function datasetStats(scenarios: GoldenScenario[]) {
  const facts = new Set<string>();
  let turns = 0;
  let queries = 0;
  for (const s of scenarios) {
    turns += s.turns.length;
    queries += s.queries.length;
    for (const f of s.memory) facts.add(f.id);
    for (const t of s.turns) for (const f of t.goldFacts) facts.add(f.id);
  }
  return {
    scenarios: scenarios.length,
    facts: facts.size,
    turns,
    queries,
  };
}
