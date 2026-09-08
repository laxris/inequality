import { reportedMetrics } from "../simulation/metrics";
import { createSimulation, stepSimulation } from "../simulation/engine";
import { validateExperiment } from "../simulation/config";
import type {
  Experiment,
  ReportedMetrics,
  SimulationState,
} from "../simulation/types";

export interface BatchRequest {
  control: Experiment;
  treatment: Experiment;
  controlName: string;
  treatmentName: string;
  firstSeed: number;
  runs: number;
  horizon: number;
  checkpoints: number[];
}
export type Outcomes = ReportedMetrics & {
  cumulativeTaxRelief: number;
  cumulativeTaxes: number;
  cumulativeRedistribution: number;
};
export interface PairedCheckpoint {
  round: number;
  control: Outcomes;
  treatment: Outcomes;
  delta: Outcomes;
}
export interface PairedRun {
  seed: number;
  checkpoints: PairedCheckpoint[];
  controlLorenz: number[];
  treatmentLorenz: number[];
}
export interface BatchResult {
  request: BatchRequest;
  pairs: PairedRun[];
}
export type BatchMessage =
  | { type: "progress"; completed: number; total: number }
  | { type: "done"; result: BatchResult }
  | { type: "error"; message: string };

export function validateBatch(request: BatchRequest): void {
  validateExperiment(request.control);
  validateExperiment(request.treatment);
  if (request.control.version !== 2 || request.treatment.version !== 2)
    throw new Error(
      "Paired experiments require model v2 common random numbers."
    );
  if (request.control.initialWealth !== request.treatment.initialWealth)
    throw new Error(
      "Control and treatment must have identical initial wealth."
    );
  if (
    !Number.isInteger(request.runs) ||
    request.runs < 1 ||
    request.runs > 1000
  )
    throw new Error("Choose 1–1,000 seed pairs.");
  if (
    !Number.isInteger(request.firstSeed) ||
    request.firstSeed < 0 ||
    request.firstSeed + request.runs - 1 > 0xffffffff
  )
    throw new Error(
      "Seed range must fit unsigned 32-bit seeds without wrapping."
    );
  if (
    !Number.isInteger(request.horizon) ||
    request.horizon < 1 ||
    request.horizon > 10000
  )
    throw new Error("Choose a horizon of 1–10,000 rounds.");
  if (
    !Array.isArray(request.checkpoints) ||
    !request.checkpoints.length ||
    request.checkpoints.length > 25 ||
    request.checkpoints.some(
      (round, i) =>
        !Number.isInteger(round) ||
        round < 1 ||
        round > request.horizon ||
        (i > 0 && round <= request.checkpoints[i - 1])
    ) ||
    request.checkpoints[request.checkpoints.length - 1] !== request.horizon
  )
    throw new Error(
      "Checkpoints must be increasing, unique whole rounds ending at the horizon (at most 25)."
    );
}

export function lorenzShares(state: SimulationState): number[] {
  let share = 0;
  return [
    0,
    ...state.participants
      .map((p) => p.wealth)
      .sort((a, b) => a - b)
      .map((wealth) => {
        share +=
          state.metrics.totalWealth === 0
            ? 0
            : wealth / state.metrics.totalWealth;
        return share;
      }),
  ];
}

export function pairedDifference(
  control: Outcomes,
  treatment: Outcomes
): Outcomes {
  const delta = { ...treatment };
  for (const key of Object.keys(delta) as (keyof Outcomes)[])
    delta[key] -= control[key];
  return delta;
}

// Retain checkpoints and final Lorenz shares, not every participant snapshot.
export function runPair(request: BatchRequest, seed: number): PairedRun {
  validateBatch(request);
  if (
    !Number.isInteger(seed) ||
    seed < request.firstSeed ||
    seed >= request.firstSeed + request.runs
  )
    throw new Error("Pair seed is outside the requested range.");
  const controlConfig = { ...request.control, seed };
  const treatmentConfig = { ...request.treatment, seed };
  let control = createSimulation(controlConfig);
  let treatment = createSimulation(treatmentConfig);
  let controlRelief = 0,
    treatmentRelief = 0;
  let controlTaxes = 0,
    treatmentTaxes = 0,
    controlRedistribution = 0,
    treatmentRedistribution = 0;
  const checkpoints: PairedCheckpoint[] = [];
  try {
    for (let round = 1; round <= request.horizon; round++) {
      control = stepSimulation(control, controlConfig);
      treatment = stepSimulation(treatment, treatmentConfig);
      controlRelief += control.ledger.taxRelief ?? 0;
      treatmentRelief += treatment.ledger.taxRelief ?? 0;
      controlTaxes += control.ledger.taxesCollected;
      treatmentTaxes += treatment.ledger.taxesCollected;
      controlRedistribution += control.ledger.redistributionPaid;
      treatmentRedistribution += treatment.ledger.redistributionPaid;
      if (
        ![
          controlRelief,
          treatmentRelief,
          controlTaxes,
          treatmentTaxes,
          controlRedistribution,
          treatmentRedistribution,
        ].every(Number.isFinite)
      )
        throw new Error("Cumulative fiscal accounting overflowed.");
      if (request.checkpoints[checkpoints.length] === round) {
        const controlOutcomes = {
          ...reportedMetrics(control),
          cumulativeTaxRelief: controlRelief,
          cumulativeTaxes: controlTaxes,
          cumulativeRedistribution: controlRedistribution,
        };
        const treatmentOutcomes = {
          ...reportedMetrics(treatment),
          cumulativeTaxRelief: treatmentRelief,
          cumulativeTaxes: treatmentTaxes,
          cumulativeRedistribution: treatmentRedistribution,
        };
        checkpoints.push({
          round,
          control: controlOutcomes,
          treatment: treatmentOutcomes,
          delta: pairedDifference(controlOutcomes, treatmentOutcomes),
        });
      }
    }
  } catch (error) {
    throw new Error(
      `Seed ${seed}, near round ${
        Math.min(control.round, treatment.round) + 1
      }: ${
        error instanceof Error ? error.message : "Simulation failed"
      }. The failed pair is not omitted from an estimate; the experiment stops.`
    );
  }
  return {
    seed,
    checkpoints,
    controlLorenz: lorenzShares(control),
    treatmentLorenz: lorenzShares(treatment),
  };
}

// R7 linear interpolation of sample quantiles. These are empirical ranges, not CIs.
export function quantile(values: number[], probability: number): number {
  if (
    !values.length ||
    values.some((value) => !Number.isFinite(value)) ||
    probability < 0 ||
    probability > 1 ||
    !Number.isFinite(probability)
  )
    throw new Error(
      "Quantiles require finite data and a probability in [0,1]."
    );
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return (
    sorted[lower] * (1 - fraction) +
    sorted[Math.min(lower + 1, sorted.length - 1)] * fraction
  );
}
export function summarizePairs(
  pairs: PairedRun[],
  round: number,
  metric: keyof Outcomes
) {
  const values = pairs.map((pair) => {
    const checkpoint = pair.checkpoints.find((point) => point.round === round);
    if (!checkpoint) throw new Error("Checkpoint missing from a seed pair.");
    return checkpoint.delta[metric];
  });
  return {
    median: quantile(values, 0.5),
    p10: quantile(values, 0.1),
    p90: quantile(values, 0.9),
    lower: values.filter((value) => value < 0).length / values.length,
    equal: values.filter((value) => value === 0).length / values.length,
    higher: values.filter((value) => value > 0).length / values.length,
  };
}
