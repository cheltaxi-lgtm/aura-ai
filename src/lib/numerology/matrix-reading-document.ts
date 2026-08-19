/**
 * Structured destiny-matrix reading document.
 * Zones are first-class objects — UI must not rediscover titles via regex in prose.
 */
import type { MatrixZoneId, MatrixZoneInstance } from "./matrix-zones";

export const MATRIX_READING_SCHEMA_VERSION = 1 as const;

export type MatrixReadingZoneBlock = {
  id: MatrixZoneId;
  label: string;
  /** Exact title line, e.g. "Отношения (20 — Суд)". */
  title: string;
  number: number | null;
  arcanaName: string | null;
  prose: string;
  practice: string | null;
  source: "ai" | "engine";
};

export type MatrixReadingMeta = {
  aiZones: number;
  engineZones: number;
  totalZones: number;
};

export type MatrixReadingDocument = {
  schemaVersion: typeof MATRIX_READING_SCHEMA_VERSION;
  intro: string;
  zones: MatrixReadingZoneBlock[];
  finale: string;
  meta: MatrixReadingMeta;
};

const PRACTICE_SPLIT_RE = /\n\s*Практика\s*:\s*/i;

export function headingLineForZone(zone: MatrixZoneInstance): string {
  if (zone.id === "steps") return zone.label;
  if (zone.id === "age" && zone.number != null) {
    const periodNote = zone.focusLabel
      ? zone.focusLabel
      : zone.age != null
        ? `период от ${zone.age} лет`
        : "";
    return periodNote
      ? `${zone.label} (${zone.number} — ${zone.arcanaName ?? "аркан"}; ${periodNote})`
      : `${zone.label} (${zone.number} — ${zone.arcanaName ?? "аркан"})`;
  }
  if (zone.id === "period" && zone.focusLabel) {
    return zone.number != null
      ? `${zone.label} (${zone.number} — ${zone.arcanaName ?? zone.focusLabel})`
      : `${zone.label} (${zone.focusLabel})`;
  }
  if (zone.number != null) {
    return `${zone.label} (${zone.number} — ${zone.arcanaName ?? "аркан"})`;
  }
  return zone.label;
}

function isMajorHeading(id: MatrixZoneId): boolean {
  return id === "steps";
}

/** Strip leading title line from a zone LLM/engine block. */
export function parseZoneBlock(
  rawBlock: string,
  zone: MatrixZoneInstance,
  source: "ai" | "engine"
): MatrixReadingZoneBlock {
  const title = headingLineForZone(zone);
  let text = (rawBlock || "").replace(/\r\n/g, "\n").replace(/\*\*/g, "").trim();

  // Drop accidental duplicate title at top.
  const titleEsc = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  text = text.replace(new RegExp(`^\\s*#{0,3}\\s*${titleEsc}\\s*\\n?`, "iu"), "").trim();
  // Also drop bare label line if model omitted arcana paren.
  text = text
    .replace(new RegExp(`^\\s*#{0,3}\\s*${zone.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n?`, "iu"), "")
    .trim();

  let practice: string | null = null;
  let prose = text;
  const parts = text.split(PRACTICE_SPLIT_RE);
  if (parts.length >= 2) {
    prose = (parts[0] || "").trim();
    practice = parts
      .slice(1)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.!?…]+$/u, "");
    if (practice) practice = `${practice}.`;
  }

  return {
    id: zone.id,
    label: zone.label,
    title,
    number: zone.number,
    arcanaName: zone.arcanaName,
    prose,
    practice,
    source,
  };
}

/**
 * Authoritative markdown for chat/share — headings come from zone objects, not prose scan.
 */
export function renderMatrixReadingMarkdown(doc: MatrixReadingDocument): string {
  const chunks: string[] = [];
  if (doc.intro.trim()) chunks.push(doc.intro.trim());

  for (const zone of doc.zones) {
    const mark = isMajorHeading(zone.id) ? "##" : "###";
    const bodyParts: string[] = [];
    if (zone.prose.trim()) bodyParts.push(zone.prose.trim());
    if (zone.practice?.trim()) {
      bodyParts.push(`**Практика:** ${zone.practice.trim()}`);
    } else if (zone.id === "steps" && zone.prose.trim()) {
      // steps body is the list itself
    }
    chunks.push(`${mark} ${zone.title}\n\n${bodyParts.join("\n\n")}`.trim());
  }

  if (doc.finale.trim()) {
    const finaleBody = doc.finale
      .replace(/^Простыми\s+словами\s*:?\s*/iu, "")
      .trim();
    // Finale lines → bullets when multi-line
    const lines = finaleBody
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    const list =
      lines.length > 1
        ? lines.map((l) => (l.startsWith("- ") ? l : `- ${l}`)).join("\n")
        : finaleBody;
    chunks.push(`## Простыми словами\n\n${list}`);
  }

  return chunks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Payload for numerology_report_history.structured_data.reading */
export function matrixReadingToStructuredPayload(doc: MatrixReadingDocument): Record<string, unknown> {
  return {
    schemaVersion: doc.schemaVersion,
    intro: doc.intro,
    finale: doc.finale,
    meta: doc.meta,
    zones: doc.zones.map((z) => ({
      id: z.id,
      label: z.label,
      title: z.title,
      number: z.number,
      arcanaName: z.arcanaName,
      prose: z.prose,
      practice: z.practice,
      source: z.source,
    })),
  };
}

export function parseMatrixReadingFromStructured(
  raw: unknown
): MatrixReadingDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const reading =
    obj.reading && typeof obj.reading === "object"
      ? (obj.reading as Record<string, unknown>)
      : obj.schemaVersion != null
        ? obj
        : null;
  if (!reading) return null;
  if (reading.schemaVersion !== MATRIX_READING_SCHEMA_VERSION) return null;
  if (!Array.isArray(reading.zones) || !reading.zones.length) return null;
  const zones: MatrixReadingZoneBlock[] = [];
  for (const item of reading.zones) {
    if (!item || typeof item !== "object") continue;
    const z = item as Record<string, unknown>;
    if (typeof z.id !== "string" || typeof z.title !== "string") continue;
    zones.push({
      id: z.id as MatrixZoneId,
      label: String(z.label ?? z.title),
      title: String(z.title),
      number: typeof z.number === "number" ? z.number : null,
      arcanaName: typeof z.arcanaName === "string" ? z.arcanaName : null,
      prose: String(z.prose ?? ""),
      practice: typeof z.practice === "string" ? z.practice : null,
      source: z.source === "ai" ? "ai" : "engine",
    });
  }
  if (!zones.length) return null;
  return {
    schemaVersion: MATRIX_READING_SCHEMA_VERSION,
    intro: String(reading.intro ?? ""),
    zones,
    finale: String(reading.finale ?? ""),
    meta: {
      aiZones: Number((reading.meta as { aiZones?: number } | undefined)?.aiZones ?? 0),
      engineZones: Number(
        (reading.meta as { engineZones?: number } | undefined)?.engineZones ?? 0
      ),
      totalZones: Number(
        (reading.meta as { totalZones?: number } | undefined)?.totalZones ?? zones.length
      ),
    },
  };
}
