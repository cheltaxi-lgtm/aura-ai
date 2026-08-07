/**
 * Bridges to existing product capabilities.
 * Real work lives here — domain/db must not import @/lib/* directly for engines.
 */

import { searchBirthPlaces, resolveBirthPlace } from "@/lib/natal/geocode";
import { destinyMatrix } from "@/lib/numerology/destiny-matrix";
import { isProAiEnabled, isProModuleEnabled } from "../config";
import { chargeProAction, refundProAction, type ProChargeResult } from "../db/billing";
import type { ProPricedAction } from "../pricing";
import { generateCaseDraft, type DraftGenerateInput } from "../ai/draft";
import {
  computeHdFacts,
  computeMatrixFacts,
  computeNatalFacts,
  enrichBirthPlace,
  normalizeBirthFields,
} from "./chart-facts";

export type ProAdapter = {
  id: string;
  isAvailable(): boolean;
};

export const aiAdapter = {
  id: "ai",
  isAvailable: () => isProAiEnabled(),
  generateDraft: generateCaseDraft,
};

export const billingAdapter = {
  id: "billing",
  isAvailable: () => isProModuleEnabled(),
  charge: (input: {
    accountId: string | number;
    userId: string;
    action: ProPricedAction;
    caseId?: string | number | null;
    idempotencyKey: string;
    description?: string;
  }): Promise<ProChargeResult> => chargeProAction(input),
  refund: refundProAction,
};

export const geocodeAdapter = {
  id: "geocode",
  isAvailable: () => isProModuleEnabled(),
  search: searchBirthPlaces,
  resolve: resolveBirthPlace,
};

export const natalAdapter = {
  id: "natal",
  isAvailable: () => isProModuleEnabled(),
  /** Lightweight birth payload for case input — full chart compute stays in product. */
  summarizeInput(payload: Record<string, unknown>): Record<string, unknown> {
    const n = normalizeBirthFields(payload);
    return {
      birthDate: n.birthDate ?? null,
      birthTime: n.birthTime ?? null,
      birthPlace: n.birthPlace ?? null,
      birthCity: n.birthCity ?? null,
      latitude: n.latitude ?? null,
      longitude: n.longitude ?? null,
      timezone: n.timezone ?? null,
      birthLat: n.birthLat ?? null,
      birthLon: n.birthLon ?? null,
      birthTz: n.birthTz ?? null,
      timeKnown: n.timeKnown ?? false,
      tradition: payload.tradition === "vedic" ? "vedic" : "western",
    };
  },
  enrichPlace: enrichBirthPlace,
  computeFacts: computeNatalFacts,
};

export const matrixAdapter = {
  id: "matrix",
  isAvailable: () => isProModuleEnabled(),
  compute(birthDate: string) {
    return destinyMatrix(birthDate);
  },
  computeFacts: computeMatrixFacts,
};

export const hdAdapter = {
  id: "hd",
  isAvailable: () => isProModuleEnabled(),
  summarizeInput(payload: Record<string, unknown>): Record<string, unknown> {
    const n = normalizeBirthFields(payload);
    return {
      birthDate: n.birthDate ?? null,
      birthTime: n.birthTime ?? null,
      birthPlace: n.birthPlace ?? null,
      timezone: n.timezone ?? n.birthTz ?? null,
      birthTz: n.birthTz ?? n.timezone ?? null,
      timeKnown: n.timeKnown ?? false,
    };
  },
  enrichPlace: enrichBirthPlace,
  computeFacts: computeHdFacts,
};

export const PRO_ADAPTERS: readonly ProAdapter[] = [
  aiAdapter,
  billingAdapter,
  geocodeAdapter,
  natalAdapter,
  matrixAdapter,
  hdAdapter,
];

export type { DraftGenerateInput };
export {
  computeHdFacts,
  computeMatrixFacts,
  computeNatalFacts,
  enrichBirthPlace,
  normalizeBirthFields,
} from "./chart-facts";
