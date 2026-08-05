/** Pro metrics stubs — emit no events in S0. */

export type ProMetricEvent = {
  name: string;
  accountId?: string | number | null;
  meta?: Record<string, unknown>;
};

export function trackProEvent(_event: ProMetricEvent): void {
  // no-op until S1 wiring
}
