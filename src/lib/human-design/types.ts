/**
 * Human Design engine — public types.
 *
 * School: tropical zodiac, geocentric apparent positions, true lunar node,
 * Design moment at exactly 88°00'00" of solar arc before birth.
 */

export const HD_ENGINE_VERSION = "hd-v2-astronomy-engine-osculating-node-exact-arc88";

export type HdBodyKey =
  | "sun"
  | "earth"
  | "moon"
  | "northNode"
  | "southNode"
  | "mercury"
  | "venus"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune"
  | "pluto";

export type HdCenterKey =
  | "head"
  | "ajna"
  | "throat"
  | "g"
  | "heart"
  | "sacral"
  | "solar"
  | "spleen"
  | "root";

export type HdTypeKey =
  | "manifestor"
  | "generator"
  | "manifestingGenerator"
  | "projector"
  | "reflector";

export type HdAuthorityKey =
  | "emotional"
  | "sacral"
  | "splenic"
  | "egoManifested"
  | "egoProjected"
  | "selfProjected"
  | "mental"
  | "lunar";

export type HdDefinitionKey =
  | "none"
  | "single"
  | "split"
  | "tripleSplit"
  | "quadrupleSplit";

export type HdCrossAngle = "right" | "juxtaposition" | "left";

export interface HdActivation {
  body: HdBodyKey;
  /** Tropical geocentric apparent longitude, degrees [0, 360). */
  longitude: number;
  gate: number;
  /** 1..6 */
  line: number;
  /** Sub-structure (P2 Variables/PHS) — computed now, displayed later. */
  color: number;
  tone: number;
  base: number;
}

export interface HdChannelState {
  /** Channel key, e.g. "1-8". */
  key: string;
  gates: [number, number];
  centers: [HdCenterKey, HdCenterKey];
  /** Both gates active (from Personality and/or Design) → channel defined. */
  defined: boolean;
}

export interface HdTimeStability {
  /**
   * Conservative certification across the full local calendar day (including
   * clock changes). False means stability is not certified, not necessarily
   * that a change was observed. Brief changes between sampled instants are
   * bounded with possible/guaranteed gates and monotone graph mechanics.
   */
  typeStable: boolean;
  authorityStable: boolean;
  profileStable: boolean;
}

export interface HdChart {
  /** A union bodygraph has no individual type, authority or planetary columns. */
  isConnection?: true;
  engineVersion: string;
  timeKnown: boolean;
  /** Omitted on public share payloads (birth PII). */
  timezone?: string;
  /** Omitted on public share payloads (birth PII). */
  birth?: {
    date: string;
    /** Local time actually used (12:00 when unknown). */
    time: string;
    utcIso: string;
    timeOccurrence?: "earlier" | "later";
  };
  design: {
    utcIso: string;
    sunLongitude: number;
  };
  personality: HdActivation[];
  designActivations: HdActivation[];
  /** Unique active gates (union of both cards), ascending. */
  activeGates: number[];
  channels: HdChannelState[];
  definedCenters: HdCenterKey[];
  type: HdTypeKey;
  authority: HdAuthorityKey;
  /** e.g. "1/3" — guaranteed one of the 12 valid profiles. */
  profile: string;
  profileLines: [number, number];
  definition: HdDefinitionKey;
  cross: {
    angle: HdCrossAngle;
    /** Canonical English name (e.g. "The Unexpected"). */
    nameEn: string;
    /** [P-Sun, P-Earth, D-Sun, D-Earth] gates. */
    gates: [number, number, number, number];
  };
  /** Present only when birth time is unknown. */
  stability?: HdTimeStability;
}

export interface HdCalcInput {
  /** YYYY-MM-DD, local to `timezone`. */
  birthDate: string;
  /** "HH:MM[:SS]" (24h) or null when unknown → representative local time. */
  birthTime: string | null;
  /** IANA timezone id, e.g. "Europe/Moscow". */
  timezone: string;
  /** Required when the known wall-clock time occurred twice. */
  birthTimeOccurrence?: "earlier" | "later";
}

/**
 * Public share form of an activation: longitude AND color/tone/base are
 * dropped. Raw longitude recovers the birth moment to hours; sub-structure
 * cells (~0.005°) recover it even tighter (Moon especially). Bodygraph only
 * needs gate + line.
 */
export type HdPublicActivation = Omit<
  HdActivation,
  "longitude" | "color" | "tone" | "base"
>;

/**
 * Public share form of a chart: no birth inputs, no timezone, no design
 * moment (design.utcIso is a deterministic function of the birth instant —
 * keeping it would de-anonymize the "no birth date" share promise), no raw
 * longitudes, and no color/tone/base. Gate/line for the bodygraph stay.
 */
export type HdPublicChart = Omit<
  HdChart,
  "birth" | "timezone" | "design" | "personality" | "designActivations"
> & {
  personality: HdPublicActivation[];
  designActivations: HdPublicActivation[];
};
