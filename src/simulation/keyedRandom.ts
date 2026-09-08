// Philox4x32-10, a counter-based generator. Reference and known-answer vectors:
// https://github.com/DEShawResearch/random123 (philox.h and tests/kat_vectors).
// The arithmetic is implemented with exact 16-bit products, avoiding BigInt in hot loops.
function multiplyHigh(a: number, b: number): number {
  const low = (a & 0xffff) * (b & 0xffff);
  const middle = (a >>> 16) * (b & 0xffff) + (low >>> 16);
  const carry = (middle & 0xffff) + (a & 0xffff) * (b >>> 16);
  return (
    ((a >>> 16) * (b >>> 16) +
      Math.floor(middle / 65536) +
      Math.floor(carry / 65536)) >>>
    0
  );
}

export function philox(
  counter: readonly [number, number, number, number],
  key: readonly [number, number]
): number[] {
  let [a, b, c, d] = counter;
  let [k0, k1] = key;
  for (let round = 0; round < 10; round++) {
    const high0 = multiplyHigh(0xd2511f53, a);
    const high1 = multiplyHigh(0xcd9e8d57, c);
    [a, b, c, d] = [
      (high1 ^ b ^ k0) >>> 0,
      Math.imul(0xcd9e8d57, c) >>> 0,
      (high0 ^ d ^ k1) >>> 0,
      Math.imul(0xd2511f53, a) >>> 0,
    ];
    k0 = (k0 + 0x9e3779b9) >>> 0;
    k1 = (k1 + 0xbb67ae85) >>> 0;
  }
  return [a, b, c, d];
}

// Numeric channel assignments are part of model v2's permanent random-key schema.
const channels = {
  "transfer.pairing": 1,
  "transfer.coin": 2,
  "shock.outcome": 3,
  "opportunity.selection": 4,
  "opportunity.return": 5,
  "investment.return": 6,
} as const;
export type RandomChannel = keyof typeof channels;
export type RandomDraw = (
  channel: RandomChannel,
  process: number,
  event: number
) => number;

export function keyedUniform(
  seed: number,
  channel: RandomChannel,
  round: number,
  event: number,
  process = 0
): number {
  if (
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff ||
    !Number.isSafeInteger(round) ||
    round < 0 ||
    !Number.isInteger(event) ||
    event < 0 ||
    event > 0xffffffff ||
    !Number.isInteger(process) ||
    process < 0 ||
    process >= 20 ||
    !(channel in channels)
  )
    throw new Error("Invalid keyed random coordinate.");
  return (
    philox(
      [
        event,
        round >>> 0,
        Math.floor(round / 4294967296),
        channels[channel] + process * 256,
      ],
      [seed, 0]
    )[0] / 4294967296
  );
}
