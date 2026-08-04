/**
 * Human Design calculation engine.
 *
 * - 26 activations: 13 bodies × (Personality at birth, Design at 88°00'00"
 *   of solar arc before birth, solved iteratively to ≤1 arcsecond).
 * - Strict type order (R-6) and authority hierarchy (R-7) with graph
 *   reachability for motor→throat and ego/G connections.
 * - Profile is asserted against the 12 valid combinations (R-8): the 88° arc
 *   mathematically allows only Design line = Personality line +2/+3 (mod 6),
 *   so any other result means the solver is broken.
 */

import { resolveBirthUtcOffsetHours } from "@/lib/natal/time";
import {
  BASE_SIZE_DEG,
  CHANNELS,
  COLOR_SIZE_DEG,
  CROSS_NAMES_EN,
  GATE_ORDER,
  GATE_SIZE_DEG,
  GATE_WHEEL_OFFSET,
  LINE_SIZE_DEG,
  MOTOR_CENTERS,
  TONE_SIZE_DEG,
  VALID_PROFILES,
  crossAngleFromProfile,
} from "./constants";
import {
  hdLongitudesAt,
  julianDateFromUnixMs,
  sunLongitudeAt,
  unixMsFromJulianDate,
} from "./ephemeris";
import type {
  HdActivation,
  HdAuthorityKey,
  HdBodyKey,
  HdCalcInput,
  HdCenterKey,
  HdChannelState,
  HdChart,
  HdDefinitionKey,
  HdTimeStability,
  HdTypeKey,
} from "./types";
import { HD_ENGINE_VERSION } from "./types";

/** Kills only floating-point representation error (~0.004 mas), never real input. */
const FP_EPSILON = 1e-9;

const MIN_BIRTH_YEAR = 1900;
const MAX_BIRTH_YEAR = 2050;

function normalize360(lon: number): number {
  return ((lon % 360) + 360) % 360;
}

/** Signed shortest delta a−b in (−180, 180]. */
function signedDelta(a: number, b: number): number {
  let d = normalize360(a) - normalize360(b);
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

export function longitudeToActivation(
  body: HdBodyKey,
  longitude: number
): HdActivation {
  const adjusted = normalize360(longitude - GATE_WHEEL_OFFSET);
  const gateIndex = Math.floor(adjusted / GATE_SIZE_DEG + FP_EPSILON) % 64;
  const gate = GATE_ORDER[gateIndex]!;
  const withinGate = adjusted - gateIndex * GATE_SIZE_DEG;
  const line = Math.min(6, Math.floor(withinGate / LINE_SIZE_DEG + FP_EPSILON) + 1);
  const withinLine = withinGate - (line - 1) * LINE_SIZE_DEG;
  const color = Math.min(6, Math.floor(withinLine / COLOR_SIZE_DEG + FP_EPSILON) + 1);
  const withinColor = withinLine - (color - 1) * COLOR_SIZE_DEG;
  const tone = Math.min(6, Math.floor(withinColor / TONE_SIZE_DEG + FP_EPSILON) + 1);
  const withinTone = withinColor - (tone - 1) * TONE_SIZE_DEG;
  const base = Math.min(5, Math.floor(withinTone / BASE_SIZE_DEG + FP_EPSILON) + 1);
  return { body, longitude: normalize360(longitude), gate, line, color, tone, base };
}

/**
 * Exact Design moment: Sun was at (birthSun − 88°00'00"). Solar speed varies
 * 0.95–1.02°/day, so the arc takes ~85.4–92.6 days; bracket [−94, −84] days
 * is safe. Sun longitude is strictly monotonic in time → bisection.
 */
export function solveDesignJd(birthJd: number, birthSunLongitude: number): number {
  const target = normalize360(birthSunLongitude - 88);
  let lo = birthJd - 94;
  let hi = birthJd - 84;

  const f = (jd: number) => signedDelta(sunLongitudeAt(jd), target);

  let fLo = f(lo);
  let fHi = f(hi);
  // Defensive bracket widening (should never trigger with ±10 days of slack).
  for (let i = 0; i < 5 && fLo > 0; i++) {
    lo -= 5;
    fLo = f(lo);
  }
  for (let i = 0; i < 5 && fHi < 0; i++) {
    hi += 5;
    fHi = f(hi);
  }
  if (fLo > 0 || fHi < 0) {
    throw new Error("HD_DESIGN_BRACKET_FAILED");
  }

  const ARCSEC = 1 / 3600;
  let best = (lo + hi) / 2;
  let bestErr = Math.abs(f(best));
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const fMid = f(mid);
    const err = Math.abs(fMid);
    if (err < bestErr) {
      best = mid;
      bestErr = err;
    }
    if (err < ARCSEC) return mid;
    if (fMid < 0) lo = mid;
    else hi = mid;
  }
  return best;
}

function buildChannelStates(activeGates: ReadonlySet<number>): HdChannelState[] {
  return CHANNELS.map((ch) => ({
    key: `${ch.gates[0]}-${ch.gates[1]}`,
    gates: [ch.gates[0], ch.gates[1]],
    centers: [ch.centers[0], ch.centers[1]],
    defined: activeGates.has(ch.gates[0]) && activeGates.has(ch.gates[1]),
  }));
}

function definedCentersFrom(channels: HdChannelState[]): Set<HdCenterKey> {
  const defined = new Set<HdCenterKey>();
  for (const ch of channels) {
    if (!ch.defined) continue;
    defined.add(ch.centers[0]);
    defined.add(ch.centers[1]);
  }
  return defined;
}

/** Adjacency of the defined-centers graph (defined channels only). */
function definedGraph(channels: HdChannelState[]): Map<HdCenterKey, Set<HdCenterKey>> {
  const adj = new Map<HdCenterKey, Set<HdCenterKey>>();
  for (const ch of channels) {
    if (!ch.defined) continue;
    const [a, b] = ch.centers;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }
  return adj;
}

function reaches(
  adj: Map<HdCenterKey, Set<HdCenterKey>>,
  from: HdCenterKey,
  to: HdCenterKey
): boolean {
  if (from === to) return adj.has(from);
  const visited = new Set<HdCenterKey>([from]);
  const queue: HdCenterKey[] = [from];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adj.get(current) ?? []) {
      if (next === to) return true;
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/** R-6 strict order. */
function computeType(
  definedCenters: Set<HdCenterKey>,
  motorToThroat: boolean
): HdTypeKey {
  if (definedCenters.size === 0) return "reflector";
  const sacral = definedCenters.has("sacral");
  if (sacral && motorToThroat) return "manifestingGenerator";
  if (sacral) return "generator";
  if (motorToThroat) return "manifestor";
  return "projector";
}

/** R-7 hierarchy — first match wins. */
function computeAuthority(
  definedCenters: Set<HdCenterKey>,
  adj: Map<HdCenterKey, Set<HdCenterKey>>,
  type: HdTypeKey
): HdAuthorityKey {
  if (definedCenters.has("solar")) return "emotional";
  if (definedCenters.has("sacral")) return "sacral";
  if (definedCenters.has("spleen")) return "splenic";
  if (definedCenters.has("heart")) {
    if (reaches(adj, "heart", "throat")) return "egoManifested";
    if (reaches(adj, "heart", "g")) return "egoProjected";
  }
  if (definedCenters.has("g") && reaches(adj, "g", "throat")) {
    return "selfProjected";
  }
  if (type === "projector") return "mental";
  if (type === "reflector") return "lunar";
  // Unreachable by construction (manifestor/generator always match above);
  // kept as a loud failure instead of a silent wrong label.
  throw new Error("HD_AUTHORITY_INVALID");
}

function computeDefinition(
  definedCenters: Set<HdCenterKey>,
  adj: Map<HdCenterKey, Set<HdCenterKey>>
): HdDefinitionKey {
  if (definedCenters.size === 0) return "none";
  const visited = new Set<HdCenterKey>();
  let components = 0;
  for (const center of definedCenters) {
    if (visited.has(center)) continue;
    components++;
    const queue: HdCenterKey[] = [center];
    visited.add(center);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of adj.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
  }
  if (components === 1) return "single";
  if (components === 2) return "split";
  if (components === 3) return "tripleSplit";
  return "quadrupleSplit";
}

/**
 * Verification helpers: run the real type/authority logic over a synthetic
 * set of defined channel keys (e.g. ["20-34"]). Used by verify scripts.
 */
export function hdTypeFromChannels(definedChannelKeys: string[]): HdTypeKey {
  const wanted = new Set(definedChannelKeys);
  const channels = CHANNELS.map((ch) => ({
    key: `${ch.gates[0]}-${ch.gates[1]}`,
    gates: [ch.gates[0], ch.gates[1]] as [number, number],
    centers: [ch.centers[0], ch.centers[1]] as [HdCenterKey, HdCenterKey],
    defined: wanted.has(`${ch.gates[0]}-${ch.gates[1]}`),
  }));
  const definedCenters = definedCentersFrom(channels);
  const adj = definedGraph(channels);
  const motorToThroat =
    adj.has("throat") &&
    MOTOR_CENTERS.some((motor) => adj.has(motor) && reaches(adj, motor, "throat"));
  return computeType(definedCenters, motorToThroat);
}

export function hdAuthorityFromChannels(definedChannelKeys: string[]): HdAuthorityKey {
  const wanted = new Set(definedChannelKeys);
  const channels = CHANNELS.map((ch) => ({
    key: `${ch.gates[0]}-${ch.gates[1]}`,
    gates: [ch.gates[0], ch.gates[1]] as [number, number],
    centers: [ch.centers[0], ch.centers[1]] as [HdCenterKey, HdCenterKey],
    defined: wanted.has(`${ch.gates[0]}-${ch.gates[1]}`),
  }));
  const definedCenters = definedCentersFrom(channels);
  const adj = definedGraph(channels);
  const type = hdTypeFromChannels(definedChannelKeys);
  return computeAuthority(definedCenters, adj, type);
}

const HD_BODIES: readonly HdBodyKey[] = [
  "sun", "earth", "moon", "northNode", "southNode",
  "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto",
];

interface CoreResult {
  personality: HdActivation[];
  designActivations: HdActivation[];
  activeGates: number[];
  channels: HdChannelState[];
  definedCenters: HdCenterKey[];
  type: HdTypeKey;
  authority: HdAuthorityKey;
  profile: string;
  profileLines: [number, number];
  definition: HdDefinitionKey;
  cross: HdChart["cross"];
  designJd: number;
  designSunLongitude: number;
}

function computeCore(birthUtcMs: number): CoreResult {
  const birthJd = julianDateFromUnixMs(birthUtcMs);
  const personalityLong = hdLongitudesAt(birthJd);
  const designJd = solveDesignJd(birthJd, personalityLong.sun);
  const designLong = hdLongitudesAt(designJd);

  const personality = HD_BODIES.map((body) =>
    longitudeToActivation(body, personalityLong[body])
  );
  const designActivations = HD_BODIES.map((body) =>
    longitudeToActivation(body, designLong[body])
  );

  const activeGates = [
    ...new Set([
      ...personality.map((a) => a.gate),
      ...designActivations.map((a) => a.gate),
    ]),
  ].sort((a, b) => a - b);

  const channels = buildChannelStates(new Set(activeGates));
  const definedCenters = definedCentersFrom(channels);
  const adj = definedGraph(channels);
  const motorToThroat =
    adj.has("throat") &&
    MOTOR_CENTERS.some((motor) => adj.has(motor) && reaches(adj, motor, "throat"));

  const type = computeType(definedCenters, motorToThroat);
  const authority = computeAuthority(definedCenters, adj, type);
  const definition = computeDefinition(definedCenters, adj);

  const pSun = personality[0]!;
  const dSun = designActivations[0]!;
  const profileLines: [number, number] = [pSun.line, dSun.line];
  const profile = `${pSun.line}/${dSun.line}`;
  if (!VALID_PROFILES.includes(profile)) {
    // Mathematically impossible with a correct 88° solver (line delta is
    // always +2/+3 mod 6) — treat as an engine bug, never a "rare case".
    throw new Error("HD_PROFILE_INVALID");
  }

  const angle = crossAngleFromProfile(profile);
  const angleIdx = angle === "right" ? 0 : angle === "juxtaposition" ? 1 : 2;
  const pEarth = personality[1]!;
  const dEarth = designActivations[1]!;
  const cross: HdChart["cross"] = {
    angle,
    nameEn: CROSS_NAMES_EN[pSun.gate]?.[angleIdx] ?? "Unknown",
    gates: [pSun.gate, pEarth.gate, dSun.gate, dEarth.gate],
  };

  return {
    personality,
    designActivations,
    activeGates,
    channels,
    definedCenters: [...definedCenters],
    type,
    authority,
    profile,
    profileLines,
    definition,
    cross,
    designJd,
    designSunLongitude: designLong.sun,
  };
}

function parseInput(input: HdCalcInput): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  timeLabel: string;
} {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.birthDate.trim());
  if (!dateMatch) throw new Error("HD_INVALID_BIRTH_DATE");
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  if (
    year < MIN_BIRTH_YEAR ||
    year > MAX_BIRTH_YEAR ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new Error("HD_INVALID_BIRTH_DATE");
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) throw new Error("HD_INVALID_BIRTH_DATE");

  const timeRaw = input.birthTime?.trim() || "12:00";
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeRaw);
  if (!timeMatch) throw new Error("HD_INVALID_BIRTH_TIME");
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (hour > 23 || minute > 59) throw new Error("HD_INVALID_BIRTH_TIME");

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
  } catch {
    throw new Error("HD_INVALID_TIMEZONE");
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    timeLabel: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function birthUtcMs(input: HdCalcInput, timeLabel: string): number {
  const { year, month, day, hour, minute } = parseInput({
    ...input,
    birthTime: timeLabel,
  });
  const offsetHours = resolveBirthUtcOffsetHours(input.birthDate, timeLabel, input.timezone);
  if (!Number.isFinite(offsetHours)) throw new Error("HD_INVALID_TIMEZONE");
  return Date.UTC(year, month - 1, day, hour, minute) - offsetHours * 3_600_000;
}

/** Current sky: HD activations for all bodies at the given moment (transits). */
export function computeTransits(atMs: number = Date.now()): HdActivation[] {
  const jd = julianDateFromUnixMs(atMs);
  const longitudes = hdLongitudesAt(jd);
  return HD_BODIES.map((body) => longitudeToActivation(body, longitudes[body]));
}

export function calculateHdChart(input: HdCalcInput): HdChart {
  const parsed = parseInput(input);
  const utcMs = birthUtcMs(input, parsed.timeLabel);
  const core = computeCore(utcMs);

  let stability: HdTimeStability | undefined;
  if (!input.birthTime) {
    const dayStart = computeCore(birthUtcMs(input, "00:00"));
    const dayEnd = computeCore(birthUtcMs(input, "23:59"));
    stability = {
      typeStable: dayStart.type === core.type && dayEnd.type === core.type,
      authorityStable:
        dayStart.authority === core.authority && dayEnd.authority === core.authority,
      profileStable:
        dayStart.profile === core.profile && dayEnd.profile === core.profile,
    };
  }

  return {
    engineVersion: HD_ENGINE_VERSION,
    timeKnown: Boolean(input.birthTime),
    timezone: input.timezone,
    birth: {
      date: input.birthDate,
      time: parsed.timeLabel,
      utcIso: new Date(utcMs).toISOString(),
    },
    design: {
      utcIso: new Date(unixMsFromJulianDate(core.designJd)).toISOString(),
      sunLongitude: core.designSunLongitude,
    },
    personality: core.personality,
    designActivations: core.designActivations,
    activeGates: core.activeGates,
    channels: core.channels,
    definedCenters: core.definedCenters,
    type: core.type,
    authority: core.authority,
    profile: core.profile,
    profileLines: core.profileLines,
    definition: core.definition,
    cross: core.cross,
    ...(stability ? { stability } : {}),
  };
}
