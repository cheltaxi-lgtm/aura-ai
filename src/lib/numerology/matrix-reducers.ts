/**
 * Reducers are versioned on purpose. Do not "fix" v3 by rewriting subtract-22.
 */

/** matrix-v4 / zovus-matrix-22-v1 — digit sum, 22 stays. */
export function reduceToArcanaDigitSum(n: number): number {
  let value = Math.abs(Math.trunc(n));
  while (value > 22) {
    value = String(value)
      .split("")
      .reduce((sum, digit) => sum + Number(digit), 0);
  }
  return value === 0 ? 22 : value;
}

/** Frozen matrix-v3 reducer. */
export function reduceToArcanaSubtract22(n: number): number {
  let value = Math.abs(Math.trunc(n));
  while (value > 22) {
    value -= 22;
  }
  return value === 0 ? 22 : value;
}

/** Live default = methodology reducer. */
export function reduceToArcanaNumber(n: number): number {
  return reduceToArcanaDigitSum(n);
}
