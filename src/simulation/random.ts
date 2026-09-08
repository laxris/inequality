import type { RandomSource } from "./types";

// Mulberry32: explicitly carried 32-bit state; algorithm is part of model v1.
export function createRandom(
  state: number,
): RandomSource & { state(): number } {
  let current = state >>> 0;
  return {
    next() {
      current = (current + 0x6d2b79f5) >>> 0;
      let value = current;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    },
    state: () => current,
  };
}

export function weightedIndex(weights: number[], rng: RandomSource): number {
  if (!weights.length || weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new Error("Selection weights must be finite and nonnegative.");
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(total)) throw new Error("Selection weights overflowed.");
  const draw = rng.next();
  if (total === 0) return Math.floor(draw * weights.length); // Explicit equal-access fallback.
  let remainder = draw * total;
  for (let index = 0; index < weights.length; index++) {
    remainder -= weights[index];
    if (remainder < 0) return index;
  }
  for (let index = weights.length - 1; index >= 0; index--)
    if (weights[index] > 0) return index;
  throw new Error("No positive selection weight.");
}
