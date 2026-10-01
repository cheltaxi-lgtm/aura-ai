import type { NatalAspect } from "./aspects";

export type NatalPattern = {
  id: string;
  label: string;
  planets: string[];
  note: string;
};

function hasAspect(aspects: NatalAspect[], a: string, b: string, aspect: string): boolean {
  return aspects.some(
    (x) =>
      x.aspect === aspect &&
      x.nature === "major" &&
      ((x.planet1 === a && x.planet2 === b) || (x.planet1 === b && x.planet2 === a))
  );
}

export function detectPatterns(aspects: NatalAspect[]): NatalPattern[] {
  const patterns: NatalPattern[] = [];
  const majors = aspects.filter((a) => a.nature === "major");

  const byPlanet = new Map<string, NatalAspect[]>();
  for (const asp of majors) {
    for (const p of [asp.planet1, asp.planet2]) {
      if (!byPlanet.has(p)) byPlanet.set(p, []);
      byPlanet.get(p)!.push(asp);
    }
  }

  for (const [planet, list] of byPlanet) {
    const conj = list.filter((a) => a.aspect === "conjunction").length;
    if (conj >= 2) {
      patterns.push({
        id: `stellium-${planet}`,
        label: "Стеллиум",
        planets: [planet],
        note: `${planet}: ${conj + 1} тел в соединении`,
      });
    }
  }

  const planets = [...new Set(majors.flatMap((a) => [a.planet1, a.planet2]))].sort();
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      for (let k = j + 1; k < planets.length; k++) {
        const [a, b, c] = [planets[i], planets[j], planets[k]];
        if (
          hasAspect(majors, a, b, "trine") &&
          hasAspect(majors, b, c, "trine") &&
          hasAspect(majors, a, c, "trine")
        ) {
          patterns.push({
            id: `grand-trine-${a}-${b}-${c}`,
            label: "Большой тригон",
            planets: [a, b, c],
            note: "Гармоничный поток между тремя точками",
          });
        }
        const apex = [a, b, c].find(focus => {
          const [left, right] = [a, b, c].filter(p => p !== focus);
          return hasAspect(majors, left, right, "opposition") &&
            hasAspect(majors, focus, left, "square") && hasAspect(majors, focus, right, "square");
        });
        if (apex) {
          patterns.push({
            id: `t-square-${a}-${b}-${c}`,
            label: "T-квадрат",
            planets: [a, b, c],
            note: `Напряжённая конфигурация — ${apex} как фокус`,
          });
        }
      }
    }
  }

  return [...new Map(patterns.map(pattern => [pattern.id, pattern])).values()].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 8);
}
