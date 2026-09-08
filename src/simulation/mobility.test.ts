import { expect, it } from "vitest";
import fc from "fast-check";
import { calculateMobility } from "./mobility";
const ascending = Array.from({ length: 100 }, (_, id) => ({
  id,
  wealth: id + 1,
}));

it("recognizes persistent and reversed rankings and quintile transitions", () => {
  const same = calculateMobility(ascending, ascending);
  expect(same.rankCorrelation).toBeCloseTo(1);
  expect(same.meanRankMovement).toBe(0);
  expect(same.bottomQuintileEscape).toBe(0);
  expect(same.topQuintilePersistence).toBe(1);
  const reversed = calculateMobility(
    ascending,
    ascending.map((p) => ({ ...p, wealth: 101 - p.wealth }))
  );
  expect(reversed.rankCorrelation).toBeCloseTo(-1);
  expect(reversed.meanRankMovement).toBeCloseTo(50 / 99);
  expect(reversed.bottomQuintileEscape).toBe(1);
  expect(reversed.topQuintilePersistence).toBe(0);
  reversed.transitions.forEach((row, i) =>
    row.forEach((value, j) => expect(value).toBe(j === 4 - i ? 1 : 0))
  );
});

it("uses midranks for ties and leaves correlation undefined for equal endpoints", () => {
  const equal = ascending.map((p) => ({ ...p, wealth: 1 }));
  expect(calculateMobility(equal, ascending).rankCorrelation).toBeNull();
  const tied = calculateMobility(equal, equal);
  expect(tied.hasTies).toBe(true);
  expect(tied.rankCorrelation).toBeNull();
  expect(tied.meanRankMovement).toBe(0);
  expect(tied.topQuintilePersistence).toBe(1); // Deterministic ID membership, not a real hierarchy.
  const groups = ascending.map((p) => ({
    ...p,
    wealth: Math.floor(p.id / 20),
  }));
  expect(calculateMobility(groups, groups).rankCorrelation).toBeCloseTo(1);
  // First two IDs swap within one tied group, which must have zero rank movement.
  expect(
    calculateMobility(groups, [...groups].reverse()).meanRankMovement
  ).toBe(0);
});

it("preserves inputs and identity matching, row/column totals and scale invariance", () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 1000 }), {
        minLength: 100,
        maxLength: 100,
      }),
      (values) => {
        const current = values.map((wealth, id) => ({ id, wealth }));
        const copy = structuredClone(current);
        const result = calculateMobility(ascending, current);
        expect(current).toEqual(copy);
        expect(
          calculateMobility([...ascending].reverse(), [...current].reverse())
        ).toEqual(result);
        expect(
          calculateMobility(
            ascending,
            current.map((p) => ({ ...p, wealth: p.wealth * 10 + 50 }))
          )
        ).toEqual(result);
        result.transitions.forEach((row) =>
          expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
        );
        for (let j = 0; j < 5; j++)
          expect(
            result.transitions.reduce((sum, row) => sum + row[j], 0)
          ).toBeCloseTo(1);
        expect(result.meanRankMovement).toBeGreaterThanOrEqual(0);
        expect(result.meanRankMovement).toBeLessThanOrEqual(1);
      }
    ),
    { numRuns: 30 }
  );
});

it("rejects missing, duplicate and invalid participant data", () => {
  for (const bad of [
    ascending.slice(1),
    ascending.map(() => ascending[0]),
    ascending.map((p) => ({ ...p, wealth: NaN })),
    ascending.map((p) => ({ ...p, wealth: -1 })),
  ])
    expect(() => calculateMobility(ascending, bad)).toThrow();
});
