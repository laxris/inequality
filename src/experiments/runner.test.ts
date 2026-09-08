import { expect, it } from "vitest";
import { presets } from "../simulation/presets";
import { createSimulation, runRounds } from "../simulation/engine";
import {
  pairedDifference,
  quantile,
  runPair,
  summarizePairs,
  validateBatch,
  type BatchRequest,
} from "./runner";

const request = (): BatchRequest => ({
  control: { ...presets[4].experiment, version: 2 },
  treatment: { ...presets[6].experiment, version: 2 },
  controlName: "Control",
  treatmentName: "Treatment",
  firstSeed: 42,
  runs: 3,
  horizon: 10,
  checkpoints: [5, 10],
});

it("computes paired treatment minus control, not the difference of independent medians", () => {
  const config = request();
  const pair = runPair(config, 42);
  const control = runRounds(
    createSimulation(config.control),
    config.control,
    10
  );
  const treatment = runRounds(
    createSimulation(config.treatment),
    config.treatment,
    10
  );
  expect(pair.checkpoints[1].delta.gini).toBe(
    treatment.metrics.gini - control.metrics.gini
  );
  expect(pair.checkpoints[1].delta.totalWealth).toBe(
    treatment.metrics.totalWealth - control.metrics.totalWealth
  );
  expect(pair.checkpoints[1].control.cumulativeTaxes).toBe(0);
  expect(pair.checkpoints[1].treatment.cumulativeTaxes).toBeGreaterThan(0);
  expect(pair.checkpoints[1].treatment.cumulativeTaxes).toBeCloseTo(
    pair.checkpoints[1].treatment.cumulativeRedistribution
  );
  expect(pair.controlLorenz).toHaveLength(101);
  expect(pair.controlLorenz[100]).toBeCloseTo(1);
  const pairs = [0, 1, 2].map((_, i) => ({
    ...pair,
    seed: i,
    checkpoints: [
      {
        ...pair.checkpoints[1],
        control: { ...pair.checkpoints[1].control, gini: [0, 0.5, 0.6][i] },
        treatment: {
          ...pair.checkpoints[1].treatment,
          gini: [0.1, 0.4, 0.7][i],
        },
        delta: { ...pair.checkpoints[1].delta, gini: [0.1, -0.1, 0.1][i] },
      },
    ],
  }));
  expect(summarizePairs(pairs, 10, "gini").median).toBe(0.1); // Median(treatment) − median(control) would be -0.1.
  expect(summarizePairs(pairs, 10, "gini").lower).toBe(1 / 3);
  expect(summarizePairs(pairs, 10, "gini").higher).toBe(2 / 3);
});
it("gives exact zero effects for identical rules and reproduces results regardless of seed execution order", () => {
  const config = request();
  config.treatment = structuredClone(config.control);
  const original = structuredClone(config);
  const pairs = [42, 43, 44].map((seed) => runPair(config, seed));
  expect([44, 43, 42].map((seed) => runPair(config, seed)).reverse()).toEqual(
    pairs
  );
  expect(config).toEqual(original);
  pairs.forEach((pair) =>
    pair.checkpoints.forEach((point) =>
      expect(Object.values(point.delta).every((value) => value === 0)).toBe(
        true
      )
    )
  );
  expect(summarizePairs(pairs, 10, "gini")).toEqual({
    median: 0,
    p10: 0,
    p90: 0,
    lower: 0,
    equal: 1,
    higher: 0,
  });
});
it("uses interpolated empirical quantiles without changing the input", () => {
  const values = [20, 0, 10];
  expect(quantile(values, 0.1)).toBe(2);
  expect(quantile(values, 0.5)).toBe(10);
  expect(quantile(values, 0.9)).toBe(18);
  expect(values).toEqual([20, 0, 10]);
  expect(() => quantile([], 0.5)).toThrow();
  expect(() => quantile([NaN], 0.5)).toThrow();
});
it("rejects invalid runs, horizons, seeds, checkpoints and mismatched starting conditions", () => {
  for (const patch of [
    { runs: 0 },
    { runs: 1001 },
    { horizon: Infinity },
    { checkpoints: [10, 5] },
    { checkpoints: [5] },
    { checkpoints: [5, 5, 10] },
    { firstSeed: 0xffffffff },
    { control: presets[4].experiment },
    { treatment: { ...request().treatment, initialWealth: 10 } },
  ]) {
    expect(() => validateBatch({ ...request(), ...patch })).toThrow();
  }
  expect(() => runPair(request(), 10)).toThrow();
});
it("stops on a failed seed rather than silently excluding it", () => {
  const config = request();
  config.horizon = 1000;
  config.checkpoints = [1000];
  config.treatment.externalProcesses = [
    {
      type: "multiplicative-returns",
      investmentFraction: 1,
      successProbability: 1,
      successReturn: 10,
      failureReturn: 0,
    },
  ];
  expect(() => runPair(config, 42)).toThrow(/Seed 42.*experiment stops/);
});
it("changing output checkpoints leaves the final paired results unchanged", () => {
  const config = request();
  const sparse = runPair({ ...config, checkpoints: [10] }, 42);
  const detailed = runPair(config, 42);
  expect(sparse.checkpoints[0]).toEqual(detailed.checkpoints[1]);
  expect(sparse.controlLorenz).toEqual(detailed.controlLorenz);
  expect(
    pairedDifference(
      detailed.checkpoints[1].control,
      detailed.checkpoints[1].control
    ).gini
  ).toBe(0);
});

it("reports paired Treasury, total modeled wealth and cumulative relief without treating retained taxes as destroyed", () => {
  const req = request();
  req.control = {
    ...req.control,
    transfers: [],
    externalProcesses: [],
    taxes: [{ type: "wealth-tax", rate: 0.1, exemption: 0 }],
    redistribution: { type: "retain" },
  };
  req.treatment = {
    ...req.control,
    taxRelief: {
      eligibility: "fixed",
      fraction: 0.05,
      discount: 1,
      affectedTax: "wealth-tax",
    },
  };
  const pair = runPair(req, 42);
  for (const point of pair.checkpoints) {
    expect(point.control.cumulativeRedistribution).toBe(0);
    expect(point.control.treasury).toBeCloseTo(point.control.cumulativeTaxes);
    expect(point.control.totalModeledWealth).toBeCloseTo(100000);
    expect(point.treatment.totalModeledWealth).toBeCloseTo(100000);
    expect(point.delta.totalWealth).toBeGreaterThan(0);
    expect(point.delta.treasury).toBeLessThan(0);
    expect(point.delta.totalWealth).toBeCloseTo(-point.delta.treasury);
    expect(point.treatment.cumulativeTaxRelief).toBeGreaterThan(0);
    expect(point.control.cumulativeTaxRelief).toBe(0);
  }
});
