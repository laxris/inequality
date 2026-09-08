import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { keyedUniform, philox } from "./keyedRandom";
import { createSimulation, runRounds } from "./engine";
import { opportunity, presets } from "./presets";
import type { Experiment } from "./types";

it("matches the three published Random123 Philox4x32-10 known-answer vectors", () => {
  expect(philox([0, 0, 0, 0], [0, 0])).toEqual([
    0x6627e8d5, 0xe169c58d, 0xbc57ac4c, 0x9b00dbd8,
  ]);
  expect(
    philox(
      [0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff],
      [0xffffffff, 0xffffffff]
    )
  ).toEqual([0x408f276d, 0x41c83b0e, 0xa20bc7c6, 0x6d5451fd]);
  expect(
    philox(
      [0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344],
      [0xa4093822, 0x299f31d0]
    )
  ).toEqual([0xd16cfe09, 0x94fdcceb, 0x5001e420, 0x24126ea1]);
});
it("keeps keyed draws invariant to evaluation order and unrelated draws", () => {
  const expected = keyedUniform(42, "opportunity.return", 1000, 5);
  for (let i = 0; i < 100; i++) keyedUniform(42, "transfer.coin", 1000, i);
  expect(keyedUniform(42, "opportunity.return", 1000, 5)).toBe(expected);
  expect(keyedUniform(42, "opportunity.selection", 1000, 5)).not.toBe(expected);
  expect(keyedUniform(42, "opportunity.return", 1000, 5, 1)).not.toBe(expected);
  expect(keyedUniform(42, "opportunity.return", 1000 + 4294967296, 5)).not.toBe(
    expected
  );
  expect(() => keyedUniform(42, "transfer.coin", -1, 0)).toThrow();
});
it("does not shift external outcomes when an unrelated zero-stake transfer is added", () => {
  const config: Experiment = { ...presets[4].experiment, version: 2 };
  const treatment: Experiment = {
    ...config,
    transfers: [{ type: "fixed-stake-exchange", stake: 0 }],
    externalProcesses: [
      { type: "independent-shocks", amount: 0 },
      ...config.externalProcesses,
    ],
  };
  expect(runRounds(createSimulation(config), config, 20)).toEqual(
    runRounds(createSimulation(treatment), treatment, 20)
  );
});
it("aligns return channels independently of opportunity counts", () => {
  const config: Experiment = {
    ...presets[4].experiment,
    version: 2,
    externalProcesses: [
      { ...opportunity, eventsPerRound: 0, investmentFraction: 0 },
      { ...opportunity, type: "multiplicative-returns" },
    ],
  };
  const treatment: Experiment = {
    ...config,
    externalProcesses: [
      { ...opportunity, eventsPerRound: 7, investmentFraction: 0 },
      config.externalProcesses[1],
    ],
  };
  expect(runRounds(createSimulation(config), config, 10)).toEqual(
    runRounds(createSimulation(treatment), treatment, 10)
  );
});
it("preserves v2 playback partition equivalence and rejects an implicit mid-run migration", () => {
  const config: Experiment = { ...presets[6].experiment, version: 2 };
  const state = createSimulation(config);
  expect(runRounds(runRounds(state, config, 7), config, 13)).toEqual(
    runRounds(state, config, 20)
  );
  expect(() =>
    runRounds(createSimulation(presets[6].experiment), config, 1)
  ).toThrow();
});

it("conserves and reconciles v2 rounds across seeds, mixed processes and policies", () => {
  for (let seed = 0; seed < 20; seed++) {
    const config: Experiment = {
      ...presets[6].experiment,
      version: 2,
      seed,
      transfers: [{ type: "fixed-stake-exchange", stake: 500 }],
      externalProcesses: [
        { type: "independent-shocks", amount: 50 },
        opportunity,
      ],
    };
    let before = createSimulation(config);
    for (let round = 0; round < 10; round++) {
      const copy = structuredClone(before);
      const after = runRounds(before, config, 1);
      expect(before).toEqual(copy);
      expect(after.metrics.totalWealth).toBeCloseTo(
        before.metrics.totalWealth +
          after.ledger.externalWealthCreated -
          after.ledger.externalWealthDestroyed,
        6
      );
      expect(after.ledger.taxesCollected).toBeCloseTo(
        after.ledger.redistributionPaid,
        6
      );
      after.participants.forEach((p, i) => {
        const entry = after.ledger.participants[i];
        expect(p.id).toBe(i);
        expect(p.wealth).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(p.wealth)).toBe(true);
        expect(p.wealth).toBeCloseTo(
          before.participants[i].wealth +
            entry.transferGains -
            entry.transferLosses +
            entry.externalGains -
            entry.externalLosses -
            entry.taxesPaid +
            entry.transfersReceived,
          6
        );
      });
      before = after;
    }
  }
});

// New v2 fixtures coexist with untouched v1 fixtures; do not regenerate to hide changes.
for (const preset of presets)
  it(`v2 exact trajectory: ${preset.name}`, () => {
    const config: Experiment = { ...preset.experiment, version: 2 };
    expect(
      [1, 10, 100].map((rounds) => {
        const state = runRounds(createSimulation(config), config, rounds);
        return {
          round: state.round,
          metrics: state.metrics,
          stateSha256: createHash("sha256")
            .update(JSON.stringify(state))
            .digest("hex"),
        };
      })
    ).toMatchSnapshot();
  });
