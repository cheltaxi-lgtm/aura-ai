/**
 * Aura reading by photo — shared contracts.
 *
 * Traditions: theosophical color vocabulary (Leadbeater/Besant),
 * Barbara Brennan's seven field layers, yogic chakra map.
 * The product is a symbolic reading of a portrait — never a medical
 * or "Kirlian device" claim.
 */

export const AURA_ENGINE_VERSION = "aura-v1";

/** Guest snapshot claim TTL: 7 days (matches cookie maxAge + row expires_at). */
export const AURA_GUEST_CLAIM_TTL_SEC = 7 * 24 * 60 * 60;
export const AURA_GUEST_CLAIM_TTL_MS = AURA_GUEST_CLAIM_TTL_SEC * 1000;

export type AuraVerdict = "bright" | "mixed" | "heavy";

export type AuraColorKey =
  | "gold"
  | "white"
  | "violet"
  | "indigo"
  | "blue"
  | "emerald"
  | "rose"
  | "orange"
  | "red"
  | "silver"
  | "smoke";

export interface AuraColor {
  key: AuraColorKey;
  /** Russian display name, e.g. «Золотой». */
  name: string;
  hex: string;
  /** Short tradition-grounded meaning for teaser/overlay. */
  meaning: string;
}

/** Brennan's seven layers, innermost → outermost. */
export const AURA_LAYER_KEYS = [
  "etheric",
  "emotional",
  "mental",
  "astral",
  "etheric_template",
  "celestial",
  "causal",
] as const;

export type AuraLayerKey = (typeof AURA_LAYER_KEYS)[number];

export interface AuraLayerState {
  key: AuraLayerKey;
  /** Russian layer name, e.g. «Эфирный». */
  name: string;
  /** One-line state, e.g. «плотный, ровный контур». */
  state: string;
}

export const AURA_CHAKRA_KEYS = [
  "muladhara",
  "svadhisthana",
  "manipura",
  "anahata",
  "vishuddha",
  "ajna",
  "sahasrara",
] as const;

export type AuraChakraKey = (typeof AURA_CHAKRA_KEYS)[number];

export type AuraChakraOpenness = "open" | "balanced" | "blocked";

export interface AuraChakraState {
  key: AuraChakraKey;
  /** Russian chakra name, e.g. «Анахата». */
  name: string;
  color: string;
  openness: AuraChakraOpenness;
  note: string;
}

/** Structured vision result. The only thing persisted from a guest session. */
export interface AuraSnapshot {
  version: 1;
  faceDetected: boolean;
  dominantColor: AuraColor;
  secondaryColors: AuraColor[];
  layers: AuraLayerState[];
  chakras: AuraChakraState[];
  verdict: AuraVerdict;
  /** 2–3 sentences shown to the guest before auth. Never the full reading. */
  teaser: string;
  createdAt: string;
}

/**
 * Pre-payment subset of the snapshot. Layers/chakras are the paid report's
 * structured basis — they ship only inside the paid report payload.
 */
export type AuraTeaserSnapshot = Omit<AuraSnapshot, "layers" | "chakras">;

export function toAuraTeaserSnapshot(snapshot: AuraSnapshot): AuraTeaserSnapshot {
  const aligned = alignAuraSnapshotColors(snapshot);
  return {
    version: aligned.version,
    faceDetected: aligned.faceDetected,
    dominantColor: aligned.dominantColor,
    secondaryColors: aligned.secondaryColors,
    verdict: aligned.verdict,
    teaser: aligned.teaser,
    createdAt: aligned.createdAt,
  };
}

export const AURA_COLORS: Record<AuraColorKey, AuraColor> = {
  gold: {
    key: "gold",
    name: "Золотой",
    hex: "#e8c46a",
    meaning: "духовная зрелость, внутренняя опора и связь с высшим",
  },
  white: {
    key: "white",
    name: "Белый",
    hex: "#f5f2ea",
    meaning: "чистота намерения, защита и обновление поля",
  },
  violet: {
    key: "violet",
    name: "Фиолетовый",
    hex: "#8b6fd8",
    meaning: "интуиция, трансформация и тяга к смыслу",
  },
  indigo: {
    key: "indigo",
    name: "Индиго",
    hex: "#4b5bbd",
    meaning: "глубокое видение, внутренняя правда",
  },
  blue: {
    key: "blue",
    name: "Синий",
    hex: "#4f8fd0",
    meaning: "спокойствие, честная речь, надёжность",
  },
  emerald: {
    key: "emerald",
    name: "Изумрудный",
    hex: "#3fae7a",
    meaning: "исцеление, рост, живое сердце",
  },
  rose: {
    key: "rose",
    name: "Розовый",
    hex: "#e08bb0",
    meaning: "тепло, принятие, открытость близости",
  },
  orange: {
    key: "orange",
    name: "Оранжевый",
    hex: "#e08b4a",
    meaning: "жизненная сила, творчество, движение",
  },
  red: {
    key: "red",
    name: "Красный",
    hex: "#c94f4f",
    meaning: "воля, страсть, плотная энергия действия",
  },
  silver: {
    key: "silver",
    name: "Серебристый",
    hex: "#c9cdd6",
    meaning: "гибкость, восприимчивость, лунная чуткость",
  },
  smoke: {
    key: "smoke",
    name: "Дымчатый",
    hex: "#8a8f9a",
    meaning: "усталость поля, незавершённые процессы, нужна пауза",
  },
};

export const AURA_LAYER_NAMES: Record<AuraLayerKey, string> = {
  etheric: "Эфирный",
  emotional: "Эмоциональный",
  mental: "Ментальный",
  astral: "Астральный",
  etheric_template: "Эфирный шаблон",
  celestial: "Небесный",
  causal: "Каузальный",
};

export const AURA_CHAKRA_NAMES: Record<AuraChakraKey, string> = {
  muladhara: "Муладхара",
  svadhisthana: "Свадхистана",
  manipura: "Манипура",
  anahata: "Анахата",
  vishuddha: "Вишуддха",
  ajna: "Аджна",
  sahasrara: "Сахасрара",
};

export const AURA_VERDICT_LABELS: Record<AuraVerdict, string> = {
  bright: "Светлое поле",
  mixed: "Смешанное поле",
  heavy: "Тяжёлое поле",
};

const COLOR_KEYS = new Set(Object.keys(AURA_COLORS));
const LAYER_KEYS = new Set<string>(AURA_LAYER_KEYS);
const CHAKRA_KEYS = new Set<string>(AURA_CHAKRA_KEYS);
const OPENNESS = new Set(["open", "balanced", "blocked"]);
const VERDICTS = new Set(["bright", "mixed", "heavy"]);

function normalizeHex(raw: unknown, fallback: string): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

function copyNamesOtherAuraColor(text: string, color: AuraColor): boolean {
  const haystack = text.toLowerCase();
  const hasCore = haystack.includes(color.name.toLowerCase());
  const hasOther = Object.values(AURA_COLORS).some(
    (candidate) =>
      candidate.key !== color.key && haystack.includes(candidate.name.toLowerCase())
  );
  return hasOther && !hasCore;
}

/** Teaser/meaning that names another palette color without the core is a lottery leftover. */
export function auraCopyContradictsCore(text: string, color: AuraColor): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return copyNamesOtherAuraColor(trimmed, color);
}

export function healAuraTeaser(teaser: string, color: AuraColor): string {
  const trimmed = typeof teaser === "string" ? teaser.trim() : "";
  if (trimmed && !auraCopyContradictsCore(trimmed, color)) return trimmed.slice(0, 600);
  return `${color.name} — ${color.meaning}. Слои и чакры показывают состояние дня.`;
}

/** Name + hex come from the product palette. Meaning may stay from the reading. */
export function alignAuraColorToCatalog(color: AuraColor): AuraColor {
  const catalog = AURA_COLORS[color.key];
  if (!catalog) return color;
  const rawMeaning =
    typeof color.meaning === "string" && color.meaning.trim()
      ? color.meaning.trim().slice(0, 200)
      : catalog.meaning;
  const meaning = auraCopyContradictsCore(rawMeaning, catalog) ? catalog.meaning : rawMeaning;
  return { key: catalog.key, name: catalog.name, hex: catalog.hex, meaning };
}

export function alignAuraSnapshotColors(snapshot: AuraSnapshot): AuraSnapshot {
  const dominantColor = alignAuraColorToCatalog(snapshot.dominantColor);
  return {
    ...snapshot,
    dominantColor,
    secondaryColors: (snapshot.secondaryColors ?? []).map(alignAuraColorToCatalog),
    teaser: healAuraTeaser(snapshot.teaser ?? "", dominantColor),
  };
}

function normalizeColor(raw: unknown, fallbackKey: AuraColorKey): AuraColor {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const keyRaw = typeof obj.key === "string" ? obj.key.trim().toLowerCase() : "";
  const key = (COLOR_KEYS.has(keyRaw) ? keyRaw : fallbackKey) as AuraColorKey;
  const base = AURA_COLORS[key];
  return alignAuraColorToCatalog({
    key,
    name: base.name,
    hex: base.hex,
    meaning:
      typeof obj.meaning === "string" && obj.meaning.trim()
        ? obj.meaning.trim().slice(0, 200)
        : base.meaning,
  });
}

/**
 * Validate + normalize a vision-model JSON payload into a safe AuraSnapshot.
 * Returns null when the payload is unusable (no face, wrong shape).
 */
export function normalizeAuraSnapshot(raw: unknown): AuraSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  if (obj.faceDetected !== true) return null;

  const verdictRaw = typeof obj.verdict === "string" ? obj.verdict.trim().toLowerCase() : "";
  const verdict = (VERDICTS.has(verdictRaw) ? verdictRaw : "mixed") as AuraVerdict;

  const dominantColor = normalizeColor(obj.dominantColor, "white");
  const secondaryColors = Array.isArray(obj.secondaryColors)
    ? obj.secondaryColors.slice(0, 2).map((c, i) => normalizeColor(c, i === 0 ? "silver" : "gold"))
    : [];

  const layersRaw = Array.isArray(obj.layers) ? obj.layers : [];
  const layers: AuraLayerState[] = AURA_LAYER_KEYS.map((key) => {
    const found = layersRaw.find(
      (l) => l && typeof l === "object" && (l as Record<string, unknown>).key === key
    ) as Record<string, unknown> | undefined;
    const state =
      typeof found?.state === "string" && found.state.trim()
        ? found.state.trim().slice(0, 160)
        : "ровный, без резких провалов";
    return { key, name: AURA_LAYER_NAMES[key], state };
  });
  if (layers.some((l) => !LAYER_KEYS.has(l.key))) return null;

  const chakrasRaw = Array.isArray(obj.chakras) ? obj.chakras : [];
  const chakras: AuraChakraState[] = AURA_CHAKRA_KEYS.map((key) => {
    const found = chakrasRaw.find(
      (c) => c && typeof c === "object" && (c as Record<string, unknown>).key === key
    ) as Record<string, unknown> | undefined;
    const opennessRaw =
      typeof found?.openness === "string" ? found.openness.trim().toLowerCase() : "";
    const openness = (OPENNESS.has(opennessRaw)
      ? opennessRaw
      : "balanced") as AuraChakraOpenness;
    const note =
      typeof found?.note === "string" && found.note.trim()
        ? found.note.trim().slice(0, 200)
        : "";
    const color = normalizeHex(found?.color, AURA_COLORS[dominantColor.key].hex);
    return { key, name: AURA_CHAKRA_NAMES[key], color, openness, note };
  });
  if (chakras.some((c) => !CHAKRA_KEYS.has(c.key))) return null;

  const teaser =
    typeof obj.teaser === "string" && obj.teaser.trim()
      ? obj.teaser.trim().slice(0, 600)
      : "";

  return alignAuraSnapshotColors({
    version: 1,
    faceDetected: true,
    dominantColor,
    secondaryColors,
    layers,
    chakras,
    verdict,
    teaser,
    createdAt: new Date().toISOString(),
  });
}
