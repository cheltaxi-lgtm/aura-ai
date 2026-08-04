/**
 * Human Design engine — public types.
 *
 * School: tropical zodiac, geocentric apparent positions, true lunar node,
 * Design moment at exactly 88°00'00" of solar arc before birth.
 */

export const HD_ENGINE_VERSION = "hd-v1-astronomy-engine-truenode-arc88";

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
  /** Type/authority/profile identical across 00:00, 12:00 and 23:59 local. */
  typeStable: boolean;
  authorityStable: boolean;
  profileStable: boolean;
}

export interface HdChart {
  engineVersion: string;
  timeKnown: boolean;
  timezone: string;
  birth: {
    date: string;
    /** Local time actually used (12:00 when unknown). */
    time: string;
    utcIso: string;
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
  /** "HH:MM" (24h) or null when unknown → 12:00 local + stability probe. */
  birthTime: string | null;
  /** IANA timezone id, e.g. "Europe/Moscow". */
  timezone: string;
}
