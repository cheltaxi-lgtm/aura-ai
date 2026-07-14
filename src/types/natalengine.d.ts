declare module "natalengine" {
  export interface NatalEngineVedicRashiBase {
    name: string;
    westernName: string;
    symbol: string;
    ruler: string;
    element: string;
    quality: "Movable" | "Fixed" | "Dual";
  }

  export interface NatalEngineVedicRashi extends NatalEngineVedicRashiBase {
    index: number;
    degreeInSign: number;
  }

  export interface NatalEngineNakshatra {
    number: number;
    name: string;
    lord: string;
    deity: string;
    symbol: string;
    pada: number;
    degreeInNakshatra: number;
    startDegree: number;
    endDegree: number;
  }

  export interface NatalEngineVedicPosition {
    longitude: number;
    tropicalLongitude: number;
    degree: string;
    rashi: NatalEngineVedicRashi;
    nakshatra: NatalEngineNakshatra;
  }

  export interface NatalEngineDashaPeriod {
    lord: string;
    startDate: Date;
    endDate: Date;
    years: number;
    isPartial: boolean;
  }

  export interface NatalEngineVedicPayload {
    positions: Record<string, NatalEngineVedicPosition>;
    ayanamsa: { value: number; formatted: string; system: string };
    moonSign: {
      rashi: NatalEngineVedicRashi;
      nakshatra: NatalEngineNakshatra;
      summary: string;
    };
    dasha: {
      birthLord: string;
      proportionElapsed: number;
      yearsRemaining: number;
      totalCycleYears: number;
      dashas: NatalEngineDashaPeriod[];
      current: NatalEngineDashaPeriod;
    };
    houses: Record<
      number,
      {
        sign: NatalEngineVedicRashiBase;
        planets: Array<{ name: string; degree: string; nakshatra: string }>;
      }
    > | null;
    julianDay: number;
    hasLocation: boolean;
    system: "Vedic (Jyotish)";
    note: string;
  }

  export function calculateAstrology(
    birthDate: string,
    birthHour?: number,
    timezone?: number,
    latitude?: number | null,
    longitude?: number | null
  ): Record<string, unknown>;

  export function calculateVedic(
    birthDate: string,
    birthHour?: number,
    timezone?: number,
    latitude?: number | null,
    longitude?: number | null
  ): NatalEngineVedicPayload;

  export function searchPlaces(
    query: string,
    count?: number
  ): Promise<
    Array<{
      name: string;
      label: string;
      latitude: number;
      longitude: number;
      timezone: string;
      countryCode?: string;
    }>
  >;

  export function resolveUtcOffset(dateStr: string, timeStr: string, timeZone: string): number;

  export function compareAstrology(
    chartA: Record<string, unknown>,
    chartB: Record<string, unknown>
  ): Record<string, unknown>;

  export function compareCharts(
    personA: Record<string, unknown>,
    personB: Record<string, unknown>,
    systems?: string[]
  ): Record<string, unknown>;
}

declare module "natalengine/astronomy" {
  export function dateToJulianDay(
    year: number,
    month: number,
    day: number,
    hour?: number
  ): number;

  export function calculateLST(jd: number, longitude: number): number;

  export function calculateAscendant(jd: number, latitude: number, longitude: number): number;

  export function calculateMidheaven(jd: number, longitude: number): number;
}
