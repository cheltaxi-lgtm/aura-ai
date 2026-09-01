/**
 * Palm reading by photo — shared contracts.
 *
 * Tradition: classical Western chiromancy (major lines, mounts, elemental
 * hand types). The product is a symbolic reading of a palm photograph —
 * never a medical diagnosis or biometric identification.
 */

export const PALM_ENGINE_VERSION = "palm-v1";

/** Guest snapshot claim TTL: 7 days (matches cookie maxAge + row expires_at). */
export const PALM_GUEST_CLAIM_TTL_SEC = 7 * 24 * 60 * 60;
export const PALM_GUEST_CLAIM_TTL_MS = PALM_GUEST_CLAIM_TTL_SEC * 1000;

export type PalmHand = "left" | "right";
export type PalmHandShape = "earth" | "air" | "fire" | "water";
export type PalmVerdict = "love" | "path" | "mind" | "vitality" | "mixed";
export type PalmLineLength = "short" | "medium" | "long";
export type PalmLineQuality = "clear" | "broken" | "chained" | "forked";
export type PalmProminence = "weak" | "balanced" | "strong";

export const PALM_LINE_KEYS = ["life", "head", "heart", "fate"] as const;
export type PalmLineKey = (typeof PALM_LINE_KEYS)[number];

export const PALM_MOUNT_KEYS = [
  "venus",
  "jupiter",
  "saturn",
  "apollo",
  "mercury",
  "mars",
  "luna",
] as const;
export type PalmMountKey = (typeof PALM_MOUNT_KEYS)[number];

export const PALM_MARK_KEYS = ["star", "cross", "island", "grille"] as const;
export type PalmMarkKey = (typeof PALM_MARK_KEYS)[number];

export interface PalmLineState {
  key: PalmLineKey;
  name: string;
  present: boolean;
  length: PalmLineLength;
  quality: PalmLineQuality;
  note: string;
}

export interface PalmMountState {
  key: PalmMountKey;
  name: string;
  prominence: PalmProminence;
  note: string;
}

export interface PalmMark {
  key: PalmMarkKey;
  name: string;
  where: string;
  note: string;
}

/** Structured vision result. The only thing persisted from a guest session. */
export interface PalmSnapshot {
  version: 1;
  handDetected: boolean;
  whichHand: PalmHand;
  handShape: PalmHandShape;
  majorLines: PalmLineState[];
  mounts: PalmMountState[];
  marks: PalmMark[];
  verdict: PalmVerdict;
  /** 2–3 sentences shown to the guest before auth. Never the full reading. */
  teaser: string;
  createdAt: string;
}

/**
 * Pre-payment subset. Lines / mounts / marks ship only inside the paid report.
 */
export type PalmTeaserSnapshot = Omit<PalmSnapshot, "majorLines" | "mounts" | "marks">;

/** Paid archive may keep lines; unpaid claim must not leak them to the client. */
export function palmSnapshotForClient(
  snapshot: PalmSnapshot,
  paid: boolean,
  report?: string | null
): PalmSnapshot | PalmTeaserSnapshot {
  if (paid && typeof report === "string" && report.trim()) return snapshot;
  return toPalmTeaserSnapshot(snapshot);
}

export function toPalmTeaserSnapshot(snapshot: PalmSnapshot): PalmTeaserSnapshot {
  const aligned = alignPalmSnapshot(snapshot);
  return {
    version: aligned.version,
    handDetected: aligned.handDetected,
    whichHand: aligned.whichHand,
    handShape: aligned.handShape,
    verdict: aligned.verdict,
    teaser: aligned.teaser,
    createdAt: aligned.createdAt,
  };
}

export const PALM_LINE_NAMES: Record<PalmLineKey, string> = {
  life: "Линия жизни",
  head: "Линия ума",
  heart: "Линия сердца",
  fate: "Линия судьбы",
};

export const PALM_MOUNT_NAMES: Record<PalmMountKey, string> = {
  venus: "Холм Венеры",
  jupiter: "Холм Юпитера",
  saturn: "Холм Сатурна",
  apollo: "Холм Аполлона",
  mercury: "Холм Меркурия",
  mars: "Холм Марса",
  luna: "Холм Луны",
};

export const PALM_MARK_NAMES: Record<PalmMarkKey, string> = {
  star: "Звезда",
  cross: "Крест",
  island: "Островок",
  grille: "Решётка",
};

export const PALM_HAND_SHAPE_LABELS: Record<PalmHandShape, string> = {
  earth: "Земля",
  air: "Воздух",
  fire: "Огонь",
  water: "Вода",
};

export const PALM_HAND_SHAPE_MEANINGS: Record<PalmHandShape, string> = {
  earth: "опора, практичность, устойчивый ритм",
  air: "ум, речь, гибкость мысли",
  fire: "воля, импульс, движение вперёд",
  water: "чувство, интуиция, глубина переживания",
};

export const PALM_VERDICT_LABELS: Record<PalmVerdict, string> = {
  love: "Линия сердца",
  path: "Путь и судьба",
  mind: "Ум и решения",
  vitality: "Жизненная сила",
  mixed: "Смешанный рисунок",
};

export const PALM_HAND_LABELS: Record<PalmHand, string> = {
  left: "Левая ладонь",
  right: "Правая ладонь",
};

const HANDS = new Set<string>(["left", "right"]);
const SHAPES = new Set<string>(["earth", "air", "fire", "water"]);
const VERDICTS = new Set<string>(["love", "path", "mind", "vitality", "mixed"]);
const LENGTHS = new Set<string>(["short", "medium", "long"]);
const QUALITIES = new Set<string>(["clear", "broken", "chained", "forked"]);
const PROMINENCE = new Set<string>(["weak", "balanced", "strong"]);
const MARK_KEYS = new Set<string>(PALM_MARK_KEYS);

function asHand(raw: unknown, fallback: PalmHand = "right"): PalmHand {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return (HANDS.has(value) ? value : fallback) as PalmHand;
}

function asShape(raw: unknown, fallback: PalmHandShape = "earth"): PalmHandShape {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return (SHAPES.has(value) ? value : fallback) as PalmHandShape;
}

function asVerdict(raw: unknown): PalmVerdict {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return (VERDICTS.has(value) ? value : "mixed") as PalmVerdict;
}

function clip(raw: unknown, max: number): string {
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, max) : "";
}

export function healPalmTeaser(teaser: string, shape: PalmHandShape): string {
  const trimmed = typeof teaser === "string" ? teaser.trim() : "";
  if (trimmed) return trimmed.slice(0, 600);
  const label = PALM_HAND_SHAPE_LABELS[shape];
  return `Тип руки — ${label}: ${PALM_HAND_SHAPE_MEANINGS[shape]}. Полный разбор линий и холмов откроется после оплаты.`;
}

export function alignPalmSnapshot(snapshot: PalmSnapshot): PalmSnapshot {
  const handShape = asShape(snapshot.handShape);
  return {
    ...snapshot,
    version: 1,
    handDetected: true,
    whichHand: asHand(snapshot.whichHand),
    handShape,
    majorLines: PALM_LINE_KEYS.map((key) => {
      const found = snapshot.majorLines?.find((line) => line.key === key);
      return {
        key,
        name: PALM_LINE_NAMES[key],
        present: found?.present !== false,
        length: (LENGTHS.has(found?.length ?? "") ? found!.length : "medium") as PalmLineLength,
        quality: (QUALITIES.has(found?.quality ?? "")
          ? found!.quality
          : "clear") as PalmLineQuality,
        note: clip(found?.note, 200),
      };
    }),
    mounts: PALM_MOUNT_KEYS.map((key) => {
      const found = snapshot.mounts?.find((mount) => mount.key === key);
      return {
        key,
        name: PALM_MOUNT_NAMES[key],
        prominence: (PROMINENCE.has(found?.prominence ?? "")
          ? found!.prominence
          : "balanced") as PalmProminence,
        note: clip(found?.note, 160),
      };
    }),
    marks: (snapshot.marks ?? [])
      .filter((mark) => MARK_KEYS.has(mark.key))
      .slice(0, 4)
      .map((mark) => ({
        key: mark.key,
        name: PALM_MARK_NAMES[mark.key],
        where: clip(mark.where, 80),
        note: clip(mark.note, 160),
      })),
    verdict: asVerdict(snapshot.verdict),
    teaser: healPalmTeaser(snapshot.teaser ?? "", handShape),
  };
}

/**
 * Validate + normalize a vision-model JSON payload into a safe PalmSnapshot.
 * Returns null when the payload is unusable (no palm, wrong shape).
 */
export function normalizePalmSnapshot(
  raw: unknown,
  declaredHand?: PalmHand
): PalmSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  if (obj.handDetected !== true) return null;

  const linesRaw = Array.isArray(obj.majorLines) ? obj.majorLines : [];
  const mountsRaw = Array.isArray(obj.mounts) ? obj.mounts : [];
  const marksRaw = Array.isArray(obj.marks) ? obj.marks : [];

  const majorLines: PalmLineState[] = PALM_LINE_KEYS.map((key) => {
    const found = linesRaw.find(
      (item) => item && typeof item === "object" && (item as Record<string, unknown>).key === key
    ) as Record<string, unknown> | undefined;
    const lengthRaw = typeof found?.length === "string" ? found.length.trim().toLowerCase() : "";
    const qualityRaw =
      typeof found?.quality === "string" ? found.quality.trim().toLowerCase() : "";
    return {
      key,
      name: PALM_LINE_NAMES[key],
      present: found?.present !== false,
      length: (LENGTHS.has(lengthRaw) ? lengthRaw : "medium") as PalmLineLength,
      quality: (QUALITIES.has(qualityRaw) ? qualityRaw : "clear") as PalmLineQuality,
      note: clip(found?.note, 200),
    };
  });

  const mounts: PalmMountState[] = PALM_MOUNT_KEYS.map((key) => {
    const found = mountsRaw.find(
      (item) => item && typeof item === "object" && (item as Record<string, unknown>).key === key
    ) as Record<string, unknown> | undefined;
    const prominenceRaw =
      typeof found?.prominence === "string" ? found.prominence.trim().toLowerCase() : "";
    return {
      key,
      name: PALM_MOUNT_NAMES[key],
      prominence: (PROMINENCE.has(prominenceRaw) ? prominenceRaw : "balanced") as PalmProminence,
      note: clip(found?.note, 160),
    };
  });

  const marks: PalmMark[] = marksRaw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const keyRaw = typeof item.key === "string" ? item.key.trim().toLowerCase() : "";
      if (!MARK_KEYS.has(keyRaw)) return null;
      const key = keyRaw as PalmMarkKey;
      return {
        key,
        name: PALM_MARK_NAMES[key],
        where: clip(item.where, 80),
        note: clip(item.note, 160),
      };
    })
    .filter((item): item is PalmMark => item !== null)
    .slice(0, 4);

  return alignPalmSnapshot({
    version: 1,
    handDetected: true,
    whichHand: asHand(obj.whichHand, declaredHand ?? "right"),
    handShape: asShape(obj.handShape),
    majorLines,
    mounts,
    marks,
    verdict: asVerdict(obj.verdict),
    teaser: clip(obj.teaser, 600),
    createdAt: new Date().toISOString(),
  });
}
