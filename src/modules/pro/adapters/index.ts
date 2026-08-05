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
    return {
      birthDate: payload.birthDate ?? null,
      birthTime: payload.birthTime ?? null,
      birthPlace: payload.birthPlace ?? null,
      latitude: payload.birthLat ?? payload.latitude ?? null,
      longitude: payload.birthLon ?? payload.longitude ?? null,
      timezone: payload.birthTz ?? payload.timezone ?? null,
      tradition: payload.tradition === "vedic" ? "vedic" : "western",
    };
  },
};

export const matrixAdapter = {
  id: "matrix",
  isAvailable: () => isProModuleEnabled(),
  compute(birthDate: string) {
    return destinyMatrix(birthDate);
  },
};

export const PRO_ADAPTERS: readonly ProAdapter[] = [
  aiAdapter,
  billingAdapter,
  geocodeAdapter,
  natalAdapter,
  matrixAdapter,
];

export type { DraftGenerateInput };
