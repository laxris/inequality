import { validateExperiment } from "./config";
import { calculateMetrics } from "./metrics";
import { createRandom, weightedIndex } from "./random";
import { keyedUniform, type RandomDraw } from "./keyedRandom";
import type {
  Experiment,
  ExternalProcess,
  Participant,
  RoundLedger,
  SimulationState,
  TaxPolicy,
  TransferProcess,
} from "./types";

function emptyLedger(participants: Participant[]): RoundLedger {
  return {
    participants: participants.map((p) => ({
      participantId: p.id,
      transferGains: 0,
      transferLosses: 0,
      externalGains: 0,
      externalLosses: 0,
      taxesPaid: 0,
      transfersReceived: 0,
    })),
    totalTransfers: 0,
    externalWealthCreated: 0,
    externalWealthDestroyed: 0,
    taxesCollected: 0,
    redistributionPaid: 0,
  };
}

export function createSimulation(config: Experiment): SimulationState {
  validateExperiment(config);
  const participants = Array.from({ length: 100 }, (_, id) => ({
    id,
    wealth: config.initialWealth,
  }));
  return {
    ...(config.version === 2 ? { modelVersion: 2 as const } : {}),
    ...(config.redistribution.type === "retain" ? { treasury: 0 } : {}),
    round: 0,
    randomState: config.seed,
    participants,
    ledger: emptyLedger(participants),
    metrics: calculateMetrics(participants),
  };
}

// Processes mutate only the round's private working copy, never the input state.
function runTransfers(
  participants: Participant[],
  ledger: RoundLedger,
  processes: TransferProcess[],
  draw: RandomDraw
) {
  for (const [processIndex, process] of processes.entries()) {
    const indices = participants.map((_, index) => index);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(draw("transfer.pairing", processIndex, i) * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    for (let i = 0; i + 1 < indices.length; i += 2) {
      const [payer, winner] =
        draw("transfer.coin", processIndex, i / 2) < 0.5
          ? [indices[i], indices[i + 1]]
          : [indices[i + 1], indices[i]];
      const amount = Math.min(process.stake, participants[payer].wealth);
      participants[payer].wealth -= amount;
      participants[winner].wealth += amount;
      ledger.participants[payer].transferLosses += amount;
      ledger.participants[winner].transferGains += amount;
      ledger.totalTransfers += amount;
    }
    calculateMetrics(participants); // Reject numerical overflow at the process boundary.
  }
}

export function accessWeights(
  participants: Participant[],
  baseline: number,
  exponent: number
): number[] {
  if (exponent === 0) return participants.map(() => 1);
  // Normalize before exponentiation: common factors cancel in the probabilities.
  const scale = Math.max(baseline, ...participants.map((p) => p.wealth));
  if (scale === 0) return participants.map(() => 0);
  return participants.map(
    (p) => (p.wealth / scale + baseline / scale) ** exponent
  );
}

function runExternalProcesses(
  participants: Participant[],
  ledger: RoundLedger,
  processes: ExternalProcess[],
  draw: RandomDraw
) {
  const applyReturn = (index: number, delta: number) => {
    const participant = participants[index];
    const actualDelta = Math.max(-participant.wealth, delta);
    participant.wealth += actualDelta;
    if (actualDelta >= 0) {
      ledger.participants[index].externalGains += actualDelta;
      ledger.externalWealthCreated += actualDelta;
    } else {
      ledger.participants[index].externalLosses -= actualDelta;
      ledger.externalWealthDestroyed -= actualDelta;
    }
  };
  const occurrences: Partial<Record<ExternalProcess["type"], number>> = {};
  for (const process of processes) {
    const processIndex = occurrences[process.type] ?? 0;
    occurrences[process.type] = processIndex + 1;
    if (process.type === "independent-shocks") {
      participants.forEach((_, index) =>
        applyReturn(
          index,
          draw("shock.outcome", processIndex, index) < 0.5
            ? process.amount
            : -process.amount
        )
      );
    } else {
      const events =
        process.type === "capital-opportunity"
          ? process.eventsPerRound
          : participants.length;
      for (let event = 0; event < events; event++) {
        const index =
          process.type === "capital-opportunity"
            ? weightedIndex(
                accessWeights(
                  participants,
                  process.baselineOpportunityAccess,
                  process.opportunityAccessExponent
                ),
                {
                  next: () =>
                    draw("opportunity.selection", processIndex, event),
                }
              )
            : event;
        const wealth = participants[index].wealth;
        const capital =
          process.type === "capital-opportunity" &&
          process.capitalMode === "fixed"
            ? Math.min(process.fixedCapital, wealth)
            : wealth * process.investmentFraction;
        const returnRate =
          draw(
            process.type === "capital-opportunity"
              ? "opportunity.return"
              : "investment.return",
            processIndex,
            event
          ) < process.successProbability
            ? process.successReturn
            : process.failureReturn;
        applyReturn(index, capital * returnRate);
        if (!Number.isFinite(participants[index].wealth))
          throw new Error("Wealth overflowed; reset with smaller returns.");
      }
    }
    calculateMetrics(participants);
  }
}

function applyPolicies(
  participants: Participant[],
  ledger: RoundLedger,
  taxes: TaxPolicy[],
  redistribution: Experiment["redistribution"],
  relief: Experiment["taxRelief"]
) {
  // Freeze eligibility before any taxes; equal wealth ties favor lower IDs.
  if (relief) {
    const count = Math.ceil(
      participants.length * relief.fraction -
        Number.EPSILON * participants.length
    );
    const eligible = new Set(
      [...participants]
        .sort(
          (a, b) =>
            (relief.eligibility === "wealthiest" ? b.wealth - a.wealth : 0) ||
            a.id - b.id
        )
        .slice(0, count)
        .map((p) => p.id)
    );
    ledger.taxBeforeRelief = 0;
    ledger.taxRelief = 0;
    for (const entry of ledger.participants) {
      entry.reliefEligible = Number(eligible.has(entry.participantId));
      entry.taxBeforeRelief = 0;
      entry.taxRelief = 0;
      entry.reliefTaxBase = 0;
      entry.reliefTaxesPaid = 0;
    }
  }
  for (const policy of taxes) {
    participants.forEach((participant, index) => {
      const flows = ledger.participants[index];
      const taxableAmount =
        policy.type === "wealth-tax"
          ? Math.max(0, participant.wealth - policy.exemption)
          : policy.taxableFlows === "transfer-gains"
          ? flows.transferGains
          : flows.externalGains +
            (policy.taxableFlows === "all-gains" ? flows.transferGains : 0);
      // Gross-gain taxes can exceed remaining wealth after subsequent losses.
      const liability = taxableAmount * policy.rate;
      const affected =
        relief &&
        (relief.affectedTax === "all" || relief.affectedTax === policy.type);
      const discount = affected && flows.reliefEligible ? relief.discount : 0;
      const tax = Math.min(participant.wealth, liability * (1 - discount));
      if (relief) {
        const beforeRelief = Math.min(participant.wealth, liability);
        const forgone = beforeRelief - tax;
        flows.taxBeforeRelief! += beforeRelief;
        flows.taxRelief! += forgone;
        ledger.taxBeforeRelief! += beforeRelief;
        ledger.taxRelief! += forgone;
        if (affected) {
          flows.reliefTaxBase! += taxableAmount;
          flows.reliefTaxesPaid! += tax;
        }
      }
      participant.wealth -= tax;
      flows.taxesPaid += tax;
      ledger.taxesCollected += tax;
    });
  }
  if (redistribution.type === "retain") return;
  const indices = participants.map((_, index) => index);
  const recipients =
    redistribution.type === "universal"
      ? indices
      : indices
          .sort(
            (a, b) =>
              participants[a].wealth - participants[b].wealth ||
              participants[a].id - participants[b].id
          )
          .slice(
            0,
            Math.ceil(
              // Ignore binary rounding at whole-person boundaries (0.07 × 100).
              participants.length * redistribution.fraction -
                Number.EPSILON * participants.length
            )
          );
  const payment = ledger.taxesCollected / recipients.length;
  recipients.forEach((index) => {
    participants[index].wealth += payment;
    ledger.participants[index].transfersReceived = payment;
    ledger.redistributionPaid += payment;
  });
}

export function stepSimulation(
  state: SimulationState,
  config: Experiment
): SimulationState {
  validateExperiment(config);
  calculateMetrics(state.participants);
  if (
    (state.treasury !== undefined &&
      (!Number.isFinite(state.treasury) || state.treasury < 0)) ||
    state.participants.length !== 100 ||
    state.participants.some((p, i) => p.id !== i) ||
    !Number.isSafeInteger(state.round) ||
    state.round < 0 ||
    state.round >= Number.MAX_SAFE_INTEGER ||
    !Number.isInteger(state.randomState) ||
    state.randomState < 0 ||
    state.randomState > 4294967295 ||
    (config.version === 2
      ? state.modelVersion !== 2 || state.randomState !== config.seed
      : state.modelVersion !== undefined)
  ) {
    throw new Error("Invalid simulation identity, round or random state.");
  }
  const participants = state.participants.map((p) => ({ ...p }));
  const ledger = emptyLedger(participants);
  const rng = createRandom(state.randomState);
  const draw: RandomDraw =
    config.version === 2
      ? (channel, process, event) =>
          keyedUniform(config.seed, channel, state.round, event, process)
      : () => rng.next();
  runTransfers(participants, ledger, config.transfers, draw);
  runExternalProcesses(participants, ledger, config.externalProcesses, draw);
  applyPolicies(
    participants,
    ledger,
    config.taxes,
    config.redistribution,
    config.taxRelief
  );
  const metrics = calculateMetrics(participants);
  // Only current-round revenue is paid out; prior reserves are never spent implicitly.
  const treasury =
    (state.treasury ?? 0) +
    (config.redistribution.type === "retain" ? ledger.taxesCollected : 0);
  if (!Number.isFinite(treasury + metrics.totalWealth))
    throw new Error("Total modeled wealth overflowed.");
  if (
    Object.values(ledger).some(
      (value) => typeof value === "number" && !Number.isFinite(value)
    ) ||
    ledger.participants.some((entry) =>
      Object.values(entry).some((value) => !Number.isFinite(value))
    )
  ) {
    throw new Error(
      "Round accounting overflowed; reset with smaller parameters."
    );
  }
  return {
    ...(config.version === 2 ? { modelVersion: 2 as const } : {}),
    ...(state.treasury !== undefined || config.redistribution.type === "retain"
      ? { treasury }
      : {}),
    round: state.round + 1,
    randomState: rng.state(),
    participants,
    ledger,
    metrics,
  };
}

export function runRounds(
  state: SimulationState,
  config: Experiment,
  rounds: number
): SimulationState {
  if (!Number.isSafeInteger(rounds) || rounds < 0)
    throw new Error("Rounds must be a nonnegative integer.");
  let next = state;
  for (let round = 0; round < rounds; round++)
    next = stepSimulation(next, config);
  return next;
}
