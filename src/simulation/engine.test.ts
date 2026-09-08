import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import fc from "fast-check";
import { validateExperiment, expectedReturn, experimentUrl } from "./config";
import {
  accessWeights,
  createSimulation,
  runRounds,
  stepSimulation,
} from "./engine";
import { calculateMetrics } from "./metrics";
import { opportunity, presets } from "./presets";
import { createRandom, weightedIndex } from "./random";
import type { Experiment, SimulationState } from "./types";

const base = (): Experiment =>
  structuredClone({ ...presets[0].experiment, transfers: [] });
const approx = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    1e-9 * Math.max(1, Math.abs(actual), Math.abs(expected)),
  );
const distribution = fc.array(fc.integer({ min: 0, max: 1_000_000 }), {
  minLength: 100,
  maxLength: 100,
});
const seed = fc.integer({ min: 0, max: 4294967295 });
const rate = fc.integer({ min: 0, max: 100 }).map((value) => value / 100);
function withWealth(config: Experiment, values: number[]) {
  const state = createSimulation(config);
  state.participants = values.map((wealth, id) => ({ id, wealth }));
  state.metrics = calculateMetrics(state.participants);
  return state;
}
function reconciles(before: SimulationState, after: SimulationState) {
  const ledger = after.ledger;
  approx(
    after.metrics.totalWealth,
    before.metrics.totalWealth +
      ledger.externalWealthCreated -
      ledger.externalWealthDestroyed,
  );
  approx(ledger.taxesCollected, ledger.redistributionPaid);
  for (const [field, aggregate] of [
    ["transferGains", "totalTransfers"],
    ["transferLosses", "totalTransfers"],
    ["externalGains", "externalWealthCreated"],
    ["externalLosses", "externalWealthDestroyed"],
    ["taxesPaid", "taxesCollected"],
    ["transfersReceived", "redistributionPaid"],
  ] as const)
    approx(
      ledger.participants.reduce((sum, entry) => sum + entry[field], 0),
      ledger[aggregate],
    );
  after.participants.forEach((participant, index) => {
    expect(participant.id).toBe(before.participants[index].id);
    expect(participant.wealth).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(participant.wealth)).toBe(true);
    const entry = ledger.participants[index];
    expect(entry.participantId).toBe(participant.id);
    Object.values(entry).forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(value)).toBe(true);
    });
    approx(
      participant.wealth,
      before.participants[index].wealth +
        entry.transferGains -
        entry.transferLosses +
        entry.externalGains -
        entry.externalLosses -
        entry.taxesPaid +
        entry.transfersReceived,
    );
  });
}

describe("economic invariants", () => {
  it("conserves arbitrary wealth in fixed-stake exchanges without debt or mutation", () => {
    fc.assert(
      fc.property(
        distribution,
        seed,
        fc.integer({ min: 0, max: 1e9 }),
        (wealth, randomSeed, stake) => {
          const config = {
            ...base(),
            seed: randomSeed,
            transfers: [{ type: "fixed-stake-exchange" as const, stake }],
          };
          const initial = withWealth(config, wealth);
          const copy = structuredClone(initial);
          const configCopy = structuredClone(config);
          const after = stepSimulation(initial, config);
          reconciles(initial, after);
          expect(initial).toEqual(copy);
          expect(config).toEqual(configCopy);
          expect(after.round).toBe(initial.round + 1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("conserves tax revenue for arbitrary wealth, rates, exemptions and recipient fractions", () => {
    fc.assert(
      fc.property(
        distribution,
        rate,
        fc.integer({ min: 0, max: 1e6 }),
        fc.integer({ min: 1, max: 100 }),
        (wealth, taxRate, exemption, bottom) => {
          const config: Experiment = {
            ...base(),
            taxes: [{ type: "wealth-tax", rate: taxRate, exemption }],
            redistribution: { type: "bottom", fraction: bottom / 100 },
          };
          const initial = withWealth(config, wealth);
          const after = stepSimulation(initial, config);
          reconciles(initial, after);
          approx(
            after.ledger.taxesCollected,
            wealth.reduce(
              (sum, amount) => sum + Math.max(0, amount - exemption) * taxRate,
              0,
            ),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("reconciles every round across mixed processes and policies", () => {
    fc.assert(
      fc.property(
        distribution,
        seed,
        rate,
        rate,
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 1, max: 12 }),
        (wealth, randomSeed, incomeRate, wealthRate, exponent, rounds) => {
          const config: Experiment = {
            ...base(),
            seed: randomSeed,
            transfers: [{ type: "fixed-stake-exchange", stake: 500 }],
            externalProcesses: [
              { type: "independent-shocks", amount: 100 },
              { ...opportunity, opportunityAccessExponent: exponent },
              { ...opportunity, type: "multiplicative-returns" },
            ],
            taxes: [
              {
                type: "income-tax",
                rate: incomeRate,
                taxableFlows: "all-gains",
              },
              { type: "wealth-tax", rate: wealthRate, exemption: 100 },
            ],
            redistribution: { type: "bottom", fraction: 0.2 },
          };
          let state = withWealth(config, wealth);
          for (let round = 0; round < rounds; round++) {
            const after = stepSimulation(state, config);
            reconciles(state, after);
            state = after;
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  it("preserves exact trajectories across reset, repetition and playback partitions", () => {
    fc.assert(
      fc.property(
        seed,
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 0, max: 40 }),
        (randomSeed, preset, first, second) => {
          const config = { ...presets[preset].experiment, seed: randomSeed };
          const initial = createSimulation(config);
          const batch = runRounds(initial, config, first + second);
          const partitioned = runRounds(
            runRounds(initial, config, first),
            config,
            second,
          );
          let stepped = initial;
          for (let i = 0; i < first + second; i++)
            stepped = stepSimulation(stepped, config);
          expect(batch).toEqual(partitioned);
          expect(batch).toEqual(stepped);
          expect(batch).toEqual(
            runRounds(createSimulation(config), config, first + second),
          );
        },
      ),
      { numRuns: 40 },
    );
  });

  it("zero-rate taxes leave the entire trajectory unchanged", () => {
    fc.assert(
      fc.property(seed, (randomSeed) => {
        const config = { ...presets[4].experiment, seed: randomSeed };
        const taxed: Experiment = {
          ...config,
          taxes: [
            { type: "income-tax", rate: 0, taxableFlows: "all-gains" },
            { type: "wealth-tax", rate: 0, exemption: 0 },
          ],
        };
        expect(runRounds(createSimulation(config), config, 10)).toEqual(
          runRounds(createSimulation(taxed), taxed, 10),
        );
      }),
      { numRuns: 30 },
    );
  });
});

describe("analytical examples and explicit semantics", () => {
  it("applies returns only to deployed capital and treats gains as external wealth", () => {
    for (const [successProbability, expected] of [
      [1, 10600],
      [0, 9400],
    ]) {
      const config: Experiment = {
        ...base(),
        initialWealth: 10000,
        externalProcesses: [
          {
            type: "multiplicative-returns",
            investmentFraction: 0.2,
            successProbability,
            successReturn: 0.3,
            failureReturn: -0.3,
          },
        ],
      };
      const before = createSimulation(config);
      const after = stepSimulation(before, config);
      expect(after.participants.every((p) => p.wealth === expected)).toBe(true);
      reconciles(before, after);
    }
    expect(expectedReturn(opportunity)).toBeCloseTo(0.1725);
  });

  it("uses independent shocks with clipped losses, not conserved transfers", () => {
    const config: Experiment = {
      ...base(),
      initialWealth: 0,
      externalProcesses: [{ type: "independent-shocks", amount: 50 }],
    };
    const initial = createSimulation(config);
    const after = stepSimulation(initial, config);
    expect(after.metrics.totalWealth).toBeGreaterThan(0);
    expect(after.ledger.externalWealthDestroyed).toBe(0);
    expect(
      after.participants.every((p) => p.wealth === 0 || p.wealth === 50),
    ).toBe(true);
    reconciles(initial, after);
  });

  it("taxes gross external gains, then post-income-tax wealth, then redistributes", () => {
    const config: Experiment = {
      ...base(),
      initialWealth: 100,
      externalProcesses: [
        {
          ...opportunity,
          type: "multiplicative-returns",
          investmentFraction: 1,
          successProbability: 1,
          successReturn: 1,
        },
      ],
      taxes: [
        { type: "income-tax", rate: 0.2, taxableFlows: "external-gains" },
        { type: "wealth-tax", rate: 0.1, exemption: 100 },
      ],
    };
    const after = stepSimulation(createSimulation(config), config);
    expect(after.ledger.participants[0].taxesPaid).toBe(28); // 20 of gains, then 8 on 180 minus exemption.
    expect(after.ledger.participants[0].transfersReceived).toBe(28);
    expect(after.participants[0].wealth).toBe(200);
  });

  it.each([
    ["transfer-gains", 500],
    ["external-gains", 2000],
    ["all-gains", 2500],
  ] as const)(
    "taxes only the selected %s in a mixed-process round",
    (taxableFlows, expectedTax) => {
      const config: Experiment = {
        ...base(),
        transfers: [{ type: "fixed-stake-exchange", stake: 50 }],
        externalProcesses: [
          {
            ...opportunity,
            type: "multiplicative-returns",
            investmentFraction: 0.1,
            successProbability: 1,
            successReturn: 1,
          },
        ],
        taxes: [{ type: "income-tax", rate: 0.2, taxableFlows }],
      };
      const before = createSimulation(config);
      const after = stepSimulation(before, config);
      expect(after.ledger.externalWealthCreated).toBe(10000);
      expect(after.ledger.taxesCollected).toBe(expectedTax);
      if (taxableFlows === "transfer-gains") {
        after.ledger.participants.forEach((entry) =>
          expect(entry.taxesPaid).toBe(entry.transferGains * 0.2),
        );
        const externalOnly = { ...config, transfers: [] };
        expect(
          stepSimulation(createSimulation(externalOnly), externalOnly).ledger
            .taxesCollected,
        ).toBe(0);
      }
      reconciles(before, after);
      const shared = JSON.parse(
        new URL(experimentUrl(config, "https://example.test")).searchParams.get(
          "experiment",
        )!,
      );
      expect(stepSimulation(createSimulation(shared), shared)).toEqual(after);
    },
  );

  it("distinguishes taxable transfer income and caps gross-gain collection after losses", () => {
    const config: Experiment = {
      ...base(),
      transfers: [{ type: "fixed-stake-exchange", stake: 50 }],
      taxes: [
        { type: "income-tax", rate: 0.2, taxableFlows: "external-gains" },
      ],
    };
    expect(
      stepSimulation(createSimulation(config), config).ledger.taxesCollected,
    ).toBe(0);
    config.taxes = [
      { type: "income-tax", rate: 0.2, taxableFlows: "all-gains" },
    ];
    expect(
      stepSimulation(createSimulation(config), config).ledger.taxesCollected,
    ).toBe(500);
    config.externalProcesses = [
      {
        ...opportunity,
        type: "multiplicative-returns",
        investmentFraction: 1,
        successProbability: 1,
        successReturn: 1,
      },
      {
        ...opportunity,
        type: "multiplicative-returns",
        investmentFraction: 1,
        successProbability: 0,
        failureReturn: -1,
      },
    ];
    const after = stepSimulation(createSimulation(config), config);
    expect(after.ledger.externalWealthCreated).toBeGreaterThan(0);
    expect(after.ledger.taxesCollected).toBe(0);
    expect(after.metrics.totalWealth).toBe(0);
  });

  it("ranks after taxation, resolves ties by ID, and rounds recipient counts up", () => {
    const config: Experiment = {
      ...base(),
      taxes: [{ type: "wealth-tax", rate: 1, exemption: 0 }],
      redistribution: { type: "bottom", fraction: 0.015 },
    };
    const after = stepSimulation(
      withWealth(
        config,
        Array.from({ length: 100 }, (_, i) => i + 1),
      ),
      config,
    );
    expect(after.participants.slice(0, 3).map((p) => p.wealth)).toEqual([
      2525, 2525, 0,
    ]);
    expect(after.participants.map((p) => p.id)).toEqual(
      Array.from({ length: 100 }, (_, i) => i),
    );
  });

  it("selects exactly seven people for a seven-percent redistribution", () => {
    const config: Experiment = {
      ...base(),
      taxes: [{ type: "wealth-tax", rate: 1, exemption: 0 }],
      redistribution: { type: "bottom", fraction: 0.07 },
    };
    const after = stepSimulation(createSimulation(config), config);
    expect(
      after.participants.filter((p) => p.wealth > 0).map((p) => p.id),
    ).toEqual([0, 1, 2, 3, 4, 5, 6]);
    reconciles(createSimulation(config), after);
  });

  it("different seeds produce different reproducible exchange trajectories", () => {
    const first = presets[0].experiment;
    const second = { ...first, seed: first.seed + 1 };
    expect(
      runRounds(createSimulation(first), first, 10).participants,
    ).not.toEqual(runRounds(createSimulation(second), second, 10).participants);
  });

  it("separates access bias from capital scaling, including zero capital", () => {
    const participants = [
      { id: 0, wealth: 0 },
      { id: 1, wealth: 100 },
      { id: 2, wealth: 200 },
    ];
    expect(accessWeights(participants, 0, 0)).toEqual([1, 1, 1]);
    expect(accessWeights(participants, 0, 1)).toEqual([0, 0.5, 1]);
    expect(accessWeights(participants, 100, 1)).toEqual([0.5, 1, 1.5]);
    expect(
      accessWeights(
        participants.map((p) => ({ ...p, wealth: Number.MAX_VALUE })),
        Number.MAX_VALUE,
        5,
      ),
    ).toEqual([32, 32, 32]);
    const config: Experiment = {
      ...base(),
      initialWealth: 0,
      externalProcesses: [
        { ...opportunity, capitalMode: "fixed", fixedCapital: 100 },
      ],
    };
    expect(
      stepSimulation(createSimulation(config), config).metrics.totalWealth,
    ).toBe(0);
    const fixed: Experiment = {
      ...base(),
      externalProcesses: [
        {
          ...opportunity,
          eventsPerRound: 1,
          capitalMode: "fixed",
          fixedCapital: 100,
          successProbability: 1,
          successReturn: 0.4,
        },
      ],
    };
    expect(
      stepSimulation(createSimulation(fixed), fixed).ledger
        .externalWealthCreated,
    ).toBe(40);
    fixed.initialWealth = 10;
    expect(
      stepSimulation(createSimulation(fixed), fixed).ledger
        .externalWealthCreated,
    ).toBe(4);
  });

  it("samples cumulative weights at boundaries and falls back to equal access", () => {
    const rng = (draw: number) => ({ next: () => draw });
    expect(weightedIndex([0, 1, 3], rng(0))).toBe(1);
    expect(weightedIndex([0, 1, 3], rng(0.25))).toBe(2);
    expect(weightedIndex([0, 0, 0], rng(0.75))).toBe(2);
    expect(() => weightedIndex([Infinity], rng(0))).toThrow();
    expect(() => weightedIndex([-1], rng(0))).toThrow();
    const random = createRandom(42);
    expect(Array.from({ length: 5 }, () => random.next())).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099,
      0.6697340414393693, 0.17481389874592423,
    ]);
  });
});

describe("metrics", () => {
  const metrics = (values: number[]) =>
    calculateMetrics(values.map((wealth, id) => ({ id, wealth })));
  it("matches equality, single-owner, median and zero-wealth examples", () => {
    expect(metrics([1, 1, 1, 1]).gini).toBe(0);
    expect(metrics([0, 0, 0, 4]).gini).toBe(0.75);
    expect(metrics([0, 0, 0, 0])).toMatchObject({
      gini: 0,
      totalWealth: 0,
      top1Share: 0,
      top10Share: 0,
      bottom50Share: 0,
      zeroWealthCount: 4,
    });
    expect(metrics([1, 3, 7, 9]).medianWealth).toBe(5);
    expect(metrics([1, 3, 7]).medianWealth).toBe(3);
    expect(metrics(Array(100).fill(1000))).toMatchObject({
      meanWealth: 1000,
      medianWealth: 1000,
      top1Share: 0.01,
      richestWealth: 1000,
    });
    expect(metrics([0, 0, 0, 4]).top10Share).toBe(1);
  });
  it("matches pairwise absolute differences and is scale/permutation invariant", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 10000 }), {
          minLength: 1,
          maxLength: 30,
        }),
        fc.integer({ min: 1, max: 100 }),
        (values, scale) => {
          const result = metrics(values);
          const total = values.reduce((a, b) => a + b, 0);
          const differences = values.reduce(
            (sum, a) =>
              sum +
              values.reduce((subtotal, b) => subtotal + Math.abs(a - b), 0),
            0,
          );
          approx(
            result.gini,
            total ? differences / (2 * values.length * total) : 0,
          );
          approx(result.gini, metrics(values.map((v) => v * scale)).gini);
          approx(result.gini, metrics([...values].reverse()).gini);
        },
      ),
    );
  });
});

describe("validation and numerical boundaries", () => {
  it.each([NaN, Infinity, -1, 1.5, 4294967296])(
    "rejects invalid seed %s",
    (value) => {
      expect(() => createSimulation({ ...base(), seed: value })).toThrow();
    },
  );
  it("rejects malformed or out-of-range configuration and metrics", () => {
    for (const value of [
      null,
      {},
      { ...base(), version: 3 },
      { ...base(), wealthFloor: "debt" },
      { ...base(), initialWealth: NaN },
      {
        ...base(),
        externalProcesses: [{ ...opportunity, successProbability: 1.1 }],
      },
      {
        ...base(),
        externalProcesses: [{ ...opportunity, investmentFraction: -0.1 }],
      },
      {
        ...base(),
        externalProcesses: [{ ...opportunity, failureReturn: -1.1 }],
      },
      {
        ...base(),
        externalProcesses: [{ ...opportunity, eventsPerRound: 0.5 }],
      },
      {
        ...base(),
        externalProcesses: [
          { ...opportunity, opportunityAccessExponent: Infinity },
        ],
      },
      { ...base(), redistribution: { type: "bottom", fraction: 0 } },
      { ...base(), taxes: [{ type: "wealth-tax", rate: 2, exemption: 0 }] },
      {
        ...base(),
        taxes: [{ type: "income-tax", rate: 0.2, taxableFlows: "wealth" }],
      },
      { ...base(), transfers: [{ type: "unknown" }] },
    ])
      expect(() => validateExperiment(value)).toThrow();
    expect(() => calculateMetrics([{ id: 0, wealth: -1 }])).toThrow();
    expect(() => calculateMetrics([{ id: 0, wealth: Infinity }])).toThrow();
    expect(() => calculateMetrics([])).toThrow();
    expect(() => runRounds(createSimulation(base()), base(), -1)).toThrow();
  });
  it("rejects invalid identity and overflow without mutating the previous state", () => {
    const config = base();
    const state = createSimulation(config);
    state.participants[1].id = 0;
    expect(() => stepSimulation(state, config)).toThrow();
    const huge = withWealth(config, [Number.MAX_VALUE, ...Array(99).fill(0)]);
    const copy = structuredClone(huge);
    config.externalProcesses = [
      {
        ...opportunity,
        type: "multiplicative-returns",
        investmentFraction: 1,
        successReturn: 10,
        successProbability: 1,
      },
    ];
    expect(() => stepSimulation(huge, config)).toThrow(/overflow/i);
    expect(huge).toEqual(copy);
  });
  it("serializes the full experiment without browser globals or history", () => {
    const config = presets[6].experiment;
    const url = experimentUrl(config, "https://example.test/lab");
    expect(JSON.parse(new URL(url).searchParams.get("experiment")!)).toEqual(
      config,
    );
    expect(runRounds(createSimulation(base()), base(), 0)).toEqual(
      createSimulation(base()),
    );
  });
});

// First-run baselines are checked alongside independent analytical/property tests.
// Do not update these snapshots during a behavior-preserving refactor.
describe("model v1 exact trajectory regression fixtures", () => {
  for (const preset of presets)
    it(preset.name, () => {
      const checkpoints = [1, 10, 100].map((rounds) =>
        runRounds(
          createSimulation(preset.experiment),
          preset.experiment,
          rounds,
        ),
      );
      expect(
        checkpoints.map((state) => ({
          round: state.round,
          randomState: state.randomState,
          metrics: state.metrics,
          stateSha256: createHash("sha256")
            .update(JSON.stringify(state))
            .digest("hex"),
        })),
      ).toMatchSnapshot();
    });
});
