/** Canonical natal-wheel projection: ecliptic longitude → screen.

Western chart: ASC left, DSC right, IC/4 bottom, MC/10 top.
Longitude increases clockwise from ASC through the lower hemisphere.
*/

import { degToRad, mod360 } from "./math";

/**
 * Mathematical polar angle in degrees (0° = +X / right, counterclockwise, Y-up).
 *
 * Relative to `originLongitude` (normally the ASC):
 * 0° → left, 90° → bottom, 180° → right, 270° → top.
 */
export function longitudeToChartAngle(longitude: number, originLongitude = 0): number {
  const relative = mod360(longitude - originLongitude);
  return mod360(180 + relative);
}

export function chartPolar(
  cx: number,
  cy: number,
  radius: number,
  longitude: number,
  originLongitude = 0,
): { x: number; y: number } {
  const radians = degToRad(longitudeToChartAngle(longitude, originLongitude));
  return {
    x: cx + radius * Math.cos(radians),
    y: cy - radius * Math.sin(radians),
  };
}
