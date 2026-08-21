import type { NatalChartRecord, NatalTradition } from "./types";

function formatSignName(signRaw: unknown): string | undefined {
  if (typeof signRaw === "string") return signRaw;
  if (signRaw && typeof signRaw === "object") {
    const name = (signRaw as { name?: string }).name;
    if (typeof name === "string") return name;
  }
  return undefined;
}

function signLine(label: string, body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  const sign = formatSignName(obj.sign);
  const degree = typeof obj.degree === "number" ? obj.degree.toFixed(1) : undefined;
  if (!sign) return null;
  return degree ? `${label}: ${sign} (${degree}°)` : `${label}: ${sign}`;
}

export function buildNatalPromptBlock(
  chart: NatalChartRecord | null,
  tradition?: NatalTradition
): string {
  if (!chart?.western && !chart?.vedic) return "";

  const lines: string[] = [
    "=== НАТАЛЬНАЯ КАРТА (расчёт движка, не выдумывай координаты) ===",
  ];

  if (chart.place) {
    lines.push(`Место рождения: ${chart.place.label} (${chart.place.timezone})`);
  }
  lines.push(`Время рождения известно: ${chart.timeKnown ? "да" : "нет (осторожно с домами/асцендентом)"}`);

  if (chart.western && tradition !== "vedic") {
    const w = chart.western;
    lines.push("", "Западная (тропик):");
    const ephemeris = typeof w.ephemeris === "string" ? w.ephemeris : null;
    const houseSystem = typeof w.houseSystem === "string" ? w.houseSystem : null;
    if (ephemeris) lines.push(`Эфемериды: ${ephemeris}${houseSystem ? `, дома: ${houseSystem}` : ""}`);
    for (const [key, label] of [
      ["sun", "Солнце"],
      ["moon", "Луна"],
      ["rising", "Асцендент"],
      ["midheaven", "MC"],
    ] as const) {
      // ASC/MC come from the technical noon when birth time is unknown —
      // never feed them to the model as facts in limited mode.
      if (!chart.timeKnown && (key === "rising" || key === "midheaven")) continue;
      const line = signLine(label, w[key]);
      if (line) lines.push(line);
    }

    const planetHouses = w.planetHouses as Record<string, number> | undefined;
    if (planetHouses && chart.timeKnown) {
      const houseBits = Object.entries(planetHouses)
        .slice(0, 7)
        .map(([p, h]) => {
          const labels: Record<string, string> = {
            sun: "Солнце",
            moon: "Луна",
            mercury: "Меркурий",
            venus: "Венера",
            mars: "Марс",
            jupiter: "Юпитер",
            saturn: "Сатурн",
          };
          return `${labels[p] ?? p}→д.${h}`;
        })
        .join(", ");
      if (houseBits) lines.push(`Дома планет (${houseSystem ?? "система домов"}): ${houseBits}`);
    }

    const houses = Array.isArray(w.houses) ? w.houses : [];
    if (houses.length && chart.timeKnown) {
      lines.push(`Куспиды домов (${houseSystem ?? "система домов"}):`);
      for (const h of houses.slice(0, 12)) {
        if (!h || typeof h !== "object") continue;
        const house = (h as { house?: number; sign?: string; degree?: number }).house;
        const sign = (h as { sign?: string }).sign;
        const degree = (h as { degree?: number }).degree;
        if (house && sign) {
          lines.push(`- Дом ${house}: ${sign}${typeof degree === "number" ? ` ${degree.toFixed(1)}°` : ""}`);
        }
      }
    }

    const aspects = Array.isArray(w.aspects) ? w.aspects.slice(0, 12) : [];
    if (aspects.length) {
      lines.push("Ключевые аспекты:");
      for (const a of aspects) {
        if (!a || typeof a !== "object") continue;
        const asp = a as Record<string, unknown>;
        const p1 = asp.planet1 ?? "?";
        const p2 = asp.planet2 ?? "?";
        const aspect = asp.aspect ?? "?";
        const orb = typeof asp.orb === "number" ? ` (орб ${asp.orb}°)` : "";
        lines.push(`- ${p1} ${aspect} ${p2}${orb}`);
      }
    }

    const patterns = Array.isArray(w.patterns) ? w.patterns.slice(0, 4) : [];
    if (patterns.length) {
      lines.push("Паттерны:");
      for (const p of patterns) {
        if (!p || typeof p !== "object") continue;
        const pat = p as { label?: string; note?: string };
        if (pat.label) lines.push(`- ${pat.label}${pat.note ? `: ${pat.note}` : ""}`);
      }
    }

    const midpoints = Array.isArray(w.midpoints) ? w.midpoints.slice(0, 5) : [];
    if (midpoints.length) {
      lines.push("Мидпоинты:");
      for (const mp of midpoints) {
        if (!mp || typeof mp !== "object") continue;
        const m = mp as { planetA?: string; planetB?: string; sign?: string; degree?: number };
        if (m.planetA && m.planetB && m.sign) {
          lines.push(
            `- ${m.planetA}/${m.planetB}: ${m.sign}${typeof m.degree === "number" ? ` ${m.degree.toFixed(1)}°` : ""}`
          );
        }
      }
    }
  }

  if (chart.vedic && tradition !== "western") {
    const v = chart.vedic;
    lines.push("", "Ведическая (сидерик, Лахири):");
    if (v.moonSign.summary) lines.push(v.moonSign.summary);
    const current = v.dasha.current;
    if (current) {
      lines.push(
        `Текущая махадаша: ${current.lord} (${current.startDate.slice(0, 10)} — ${current.endDate.slice(0, 10)})`
      );
    }
    lines.push(
      `Накшатра Луны: ${v.moonSign.nakshatra.name}, пада ${v.moonSign.nakshatra.pada}, управитель ${v.moonSign.nakshatra.lord}`
    );

    const labels = {
      sun: "Солнце",
      moon: "Луна",
      mercury: "Меркурий",
      venus: "Венера",
      mars: "Марс",
      jupiter: "Юпитер",
      saturn: "Сатурн",
      rahu: "Раху",
      ketu: "Кету",
      ascendant: "Лагна",
    } as const;
    const positionBits = Object.entries(labels).flatMap(([key, label]) => {
      if (key === "ascendant" && !chart.timeKnown) return [];
      const position = v.positions[key as keyof typeof v.positions];
      return position ? [`${label}: ${position.rashi.name} ${position.degree}`] : [];
    });
    if (positionBits.length) {
      lines.push(`Положения: ${positionBits.join(", ")}`);
    }

    if (chart.timeKnown && v.houses) {
      const occupied = Object.entries(v.houses).flatMap(([house, data]) => {
        if (!data?.planets.length) return [];
        const names = data.planets.map((planet) => labels[planet.name as keyof typeof labels] ?? planet.name);
        return [`д.${house}: ${names.join("/")}`];
      });
      if (occupied.length) {
        lines.push(`Занятые дома: ${occupied.join(", ")}`);
      }
    }
  }

  if (chart.transits?.length) {
    const aspectTransits = chart.transits.filter((t) => t.kind === "aspect_hit").slice(0, 6);
    const signTransits = chart.transits.filter((t) => t.kind === "sign_change").slice(0, 4);
    if (aspectTransits.length) {
      lines.push("", "Транзиты по аспектам (7 дней):");
      for (const t of aspectTransits) {
        lines.push(`- ${t.note}`);
      }
    }
    if (signTransits.length) {
      lines.push("", "Транзиты (знак к знаку, на сегодня):");
      for (const t of signTransits) {
        lines.push(`- ${t.note}`);
      }
    }
    const memoryLinked = chart.transits.filter((t) => t.relatedFacts?.length).slice(0, 3);
    if (memoryLinked.length) {
      lines.push("", "Связь с памятью клиента:");
      for (const t of memoryLinked) {
        lines.push(`- ${t.note}`);
      }
    }
  }

  if (chart.warnings.length) {
    lines.push("", "Ограничения данных:", ...chart.warnings.map((w) => `- ${w}`));
  }

  lines.push(
    "",
    "Правило: опирайся только на эти расчёты. Не называй градусы и дома, которых нет в блоке."
  );

  return lines.join("\n");
}
