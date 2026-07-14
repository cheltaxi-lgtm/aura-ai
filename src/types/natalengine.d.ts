declare module "natalengine" {
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
  ): Record<string, unknown>;

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
