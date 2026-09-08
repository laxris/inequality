import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import fc from "fast-check";
import { createSimulation, runRounds, stepSimulation } from "./engine";
import { calculateMetrics, reportedMetrics, reliefIncidence } from "./metrics";
import { validateExperiment, experimentUrl } from "./config";
import { presets } from "./presets";
import type { Experiment } from "./types";

const config = (): Experiment => ({
  ...structuredClone(presets[0].experiment),
  version: 2,
  transfers: [],
  externalProcesses: [],
  taxes: [{ type: "wealth-tax", rate: 0.1, exemption: 0 }],
  redistribution: { type: "retain" },
});
const relief = {
  eligibility: "wealthiest" as const,
  fraction: 0.05,
  discount: 0.8,
  affectedTax: "wealth-tax" as const,
};

it("retains taxes without destroying modeled wealth and never spends reserves implicitly", () => {
  const c = config();
  const initial = createSimulation(c);
  const state = runRounds(initial, c, 2);
  expect(initial.treasury).toBe(0);
  expect(state.treasury).toBe(19000);
  expect(state.metrics.totalWealth).toBe(81000);
  expect(state.ledger.redistributionPaid).toBe(0);
  expect(reportedMetrics(state).totalModeledWealth).toBe(100000);
  const paying = stepSimulation(state, {
    ...c,
    redistribution: { type: "universal" },
  });
  expect(paying.treasury).toBe(19000);
  expect(paying.metrics.totalWealth).toBe(81000);
  expect(paying.ledger.taxesCollected).toBeCloseTo(
    paying.ledger.redistributionPaid
  );
  expect(createSimulation(c)).toEqual(initial);
});

it("discounts liability for exactly the top 5%, and accounts for forgone collections", () => {
  const c = { ...config(), taxRelief: relief };
  const state = stepSimulation(createSimulation(c), c);
  expect(
    state.ledger.participants
      .filter((p) => p.reliefEligible)
      .map((p) => p.participantId)
  ).toEqual([0, 1, 2, 3, 4]);
  expect(state.participants[0].wealth).toBe(980);
  expect(state.participants[5].wealth).toBe(900);
  expect(state.ledger.taxBeforeRelief).toBe(10000);
  expect(state.ledger.taxRelief).toBe(400);
  expect(state.treasury).toBe(9600);
  expect(reliefIncidence(state, true).effectiveRate).toBeCloseTo(0.02);
  expect(reliefIncidence(state, false).effectiveRate).toBeCloseTo(0.1);
  const seven = { ...c, taxRelief: { ...relief, fraction: 0.07, discount: 1 } };
  const next = stepSimulation(createSimulation(seven), seven);
  expect(next.ledger.participants.filter((p) => p.reliefEligible)).toHaveLength(
    7
  );
  expect(next.ledger.participants[6].taxesPaid).toBe(0);
});

it("distinguishes fixed privilege from current wealth and freezes membership before all taxes", () => {
  const c: Experiment = {
    ...config(),
    taxRelief: { ...relief, fraction: 0.01, discount: 1 },
    taxes: [
      { type: "wealth-tax", rate: 0.75, exemption: 0 },
      { type: "wealth-tax", rate: 0.5, exemption: 0 },
    ],
  };
  const initial = createSimulation(c);
  initial.participants[99].wealth = 2000;
  initial.metrics = calculateMetrics(initial.participants);
  const dynamic = stepSimulation(initial, c);
  const fixed = stepSimulation(initial, {
    ...c,
    taxRelief: { ...c.taxRelief!, eligibility: "fixed" },
  });
  expect(dynamic.ledger.participants[99].reliefEligible).toBe(1);
  expect(fixed.ledger.participants[0].reliefEligible).toBe(1);
  expect(fixed.ledger.participants[99].reliefEligible).toBe(0);
  // The first tax makes everyone equal at zero; eligibility still uses pre-tax rank.
  const frozen: Experiment = {
    ...c,
    taxes: [
      { type: "wealth-tax", rate: 1, exemption: 0 },
      { type: "wealth-tax", rate: 0.5, exemption: 0 },
    ],
    taxRelief: { ...relief, discount: 0 },
  };
  const depleted = stepSimulation(initial, frozen);
  expect(depleted.ledger.participants[99].reliefEligible).toBe(1);
  expect(depleted.ledger.participants[4].reliefEligible).toBe(0);
  expect(depleted.participants.every((p) => p.wealth === 0)).toBe(true);
});

it("zero relief preserves wealth and random trajectories; selected tax and funds caps remain explicit", () => {
  const base: Experiment = { ...presets[6].experiment, version: 2 };
  const discounted = { ...base, taxRelief: { ...relief, discount: 0 } };
  const a = runRounds(createSimulation(base), base, 20);
  const b = runRounds(createSimulation(discounted), discounted, 20);
  expect(b.participants).toEqual(a.participants);
  expect(b.randomState).toBe(a.randomState);
  expect(b.metrics).toEqual(a.metrics);
  expect(b.ledger.taxRelief).toBe(0);
  const wrongTax = {
    ...config(),
    taxRelief: { ...relief, affectedTax: "income-tax" as const },
  };
  expect(
    stepSimulation(createSimulation(wrongTax), wrongTax).participants
  ).toEqual(stepSimulation(createSimulation(config()), config()).participants);
  // First process doubles wealth, second destroys 90%; taxable gross gain exceeds remaining wealth.
  const capped: Experiment = {
    ...config(),
    externalProcesses: [
      {
        type: "multiplicative-returns",
        investmentFraction: 1,
        successProbability: 1,
        successReturn: 1,
        failureReturn: 0,
      },
      {
        type: "multiplicative-returns",
        investmentFraction: 1,
        successProbability: 0,
        successReturn: 0,
        failureReturn: -0.9,
      },
    ],
    taxes: [{ type: "income-tax", rate: 1, taxableFlows: "external-gains" }],
    taxRelief: { ...relief, affectedTax: "income-tax", discount: 0.5 },
  };
  const cap = stepSimulation(createSimulation(capped), capped);
  expect(cap.ledger.participants[0].taxesPaid).toBeCloseTo(200);
  expect(cap.ledger.participants[0].taxRelief).toBe(0); // 50% liability discount still hits the funds cap.
});

it("preserves fiscal conservation, ledger reconciliation, determinism and no debt across arbitrary valid runs", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 0xffffffff }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.double({ min: 0.01, max: 1, noNaN: true }),
      fc.boolean(),
      (seed, discount, fraction, retain) => {
        const c: Experiment = {
          ...presets[6].experiment,
          version: 2,
          seed,
          taxRelief: { ...relief, fraction, discount },
          redistribution: retain
            ? { type: "retain" }
            : { type: "bottom", fraction },
        };
        let before = createSimulation(c);
        for (let r = 0; r < 5; r++) {
          const copy = structuredClone(before);
          const after = stepSimulation(before, c);
          expect(before).toEqual(copy);
          expect(after).toEqual(stepSimulation(copy, c));
          const difference =
            reportedMetrics(after).totalModeledWealth -
            reportedMetrics(before).totalModeledWealth;
          expect(difference).toBeCloseTo(
            after.ledger.externalWealthCreated -
              after.ledger.externalWealthDestroyed,
            6
          );
          expect((after.treasury ?? 0) - (before.treasury ?? 0)).toBeCloseTo(
            after.ledger.taxesCollected - after.ledger.redistributionPaid,
            6
          );
          expect(
            after.ledger.taxBeforeRelief! - after.ledger.taxRelief!
          ).toBeCloseTo(after.ledger.taxesCollected, 6);
          expect(after.ledger.taxRelief).toBeCloseTo(
            after.ledger.participants.reduce((s, p) => s + p.taxRelief!, 0),
            6
          );
          after.participants.forEach((p, i) => {
            const l = after.ledger.participants[i];
            expect(p.id).toBe(i);
            expect(Number.isFinite(p.wealth) && p.wealth >= 0).toBe(true);
            expect(p.wealth - before.participants[i].wealth).toBeCloseTo(
              l.transferGains -
                l.transferLosses +
                l.externalGains -
                l.externalLosses -
                l.taxesPaid +
                l.transfersReceived,
              6
            );
          });
          before = after;
        }
      }
    ),
    { numRuns: 30 }
  );
});

it("validates fiscal parameters and state, preserves them in URLs, and rejects overflow", () => {
  const c = { ...config(), taxRelief: relief };
  const url = new URL(experimentUrl(c, "https://example.test"));
  expect(JSON.parse(url.searchParams.get("experiment")!)).toEqual(c);
  for (const patch of [
    { discount: NaN },
    { discount: 2 },
    { fraction: 0 },
    { fraction: Infinity },
    { eligibility: "unknown" },
    { affectedTax: "none" },
  ])
    expect(() =>
      validateExperiment({ ...c, taxRelief: { ...relief, ...patch } })
    ).toThrow();
  const state = createSimulation(c);
  for (const treasury of [-1, NaN, Infinity])
    expect(() => stepSimulation({ ...state, treasury }, c)).toThrow();
  const giant = {
    ...state,
    treasury: Number.MAX_VALUE,
    participants: state.participants.map((p) => ({ ...p, wealth: 1e305 })),
  };
  expect(() => stepSimulation(giant, c)).toThrow(/overflow/);
});

for (const version of [1, 2] as const)
  it(`preserves fiscal trajectories for model v${version}`, () => {
    const results = (["wealthiest", "fixed"] as const).flatMap((eligibility) =>
      (["retain", "bottom"] as const).map((destination) => {
        const c: Experiment = {
          ...presets[6].experiment,
          version,
          transfers: [{ type: "fixed-stake-exchange", stake: 50 }],
          taxes: [
            { type: "income-tax", rate: 0.2, taxableFlows: "all-gains" },
            { type: "wealth-tax", rate: 0.01, exemption: 100 },
          ],
          taxRelief: { ...relief, eligibility },
          redistribution:
            destination === "retain"
              ? { type: "retain" }
              : { type: "bottom", fraction: 0.2 },
        };
        const state = runRounds(createSimulation(c), c, 100);
        return {
          eligibility,
          destination,
          metrics: reportedMetrics(state),
          stateSha256: createHash("sha256")
            .update(JSON.stringify(state))
            .digest("hex"),
        };
      })
    );
    expect(results).toMatchSnapshot();
  });
