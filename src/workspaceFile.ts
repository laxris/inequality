import { validateComposerExperiment } from "./simulation/config";
import { calculateMetrics, reportedMetrics } from "./simulation/metrics";
import { createSimulation } from "./simulation/engine";
import { HISTORY_LIMIT, SCENARIO_LIMIT, type Workspace, type Scenario } from "./workspace";
import type { Experiment, Participant, SimulationState, HistoryPoint } from "./simulation/types";

export const WORKSPACE_FILE_LIMIT = 50 * 1024 * 1024;
const NUMERICAL_TOLERANCE = 1e-9;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Expected an object in workspace file.");
  return value as Record<string, unknown>;
}
function number(value: unknown, name: string, max = Number.MAX_VALUE, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isSafeInteger(value)))
    throw Error(`Invalid ${name} in workspace file.`);
  return value;
}
const round = (value: unknown) => number(value, "round", Number.MAX_SAFE_INTEGER - 1, true);
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max) throw Error("Invalid text in workspace file.");
  return value;
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw Error("Invalid or oversized list in workspace file.");
  return value;
}
function close(actual: number, expected: number, label: string) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || Math.abs(actual - expected) > NUMERICAL_TOLERANCE * Math.max(1, Math.abs(actual), Math.abs(expected)))
    throw Error(`Inconsistent ${label} in workspace file.`);
}
function participants(value: unknown): Participant[] {
  const entries = array(value, 100);
  if (entries.length !== 100) throw Error("A scenario must contain 100 participants.");
  return entries.map((entry, id) => {
    const p = object(entry);
    if (p.id !== id) throw Error("Participant identities must remain in order.");
    return { id, wealth: number(p.wealth, "wealth") };
  });
}
function config(value: unknown): Experiment {
  // Bound unknown extension data before passing it to configuration comparison/serialization.
  function depth(v: unknown, level = 0): void {
    if (level > 8) throw Error("Configuration nesting is too deep.");
    if (v && typeof v === "object") Object.values(v).forEach(child => depth(child, level + 1));
  }
  depth(value);
  validateComposerExperiment(value);
  return structuredClone(value);
}
function numericFields<T extends object>(value: unknown, template: T, optional: string[] = []): T {
  const source = object(value);
  const output: Record<string, number> = {};
  for (const key of Object.keys(template)) output[key] = number(source[key], key);
  for (const key of optional) if (source[key] !== undefined) output[key] = number(source[key], key);
  return output as T;
}
function state(value: unknown, experiment: Experiment): SimulationState {
  const raw = object(value);
  const initial = createSimulation(experiment);
  const population = participants(raw.participants);
  const metrics = calculateMetrics(population);
  for (const key of Object.keys(metrics) as (keyof typeof metrics)[])
    close(number(object(raw.metrics)[key], key), metrics[key], key);
  const currentRound = round(raw.round);
  const randomState = number(raw.randomState, "random state", 0xffffffff, true);
  if (experiment.version === 2 ? raw.modelVersion !== 2 || randomState !== experiment.seed : raw.modelVersion !== undefined)
    throw Error("Randomness model/state mismatch.");
  const ledgerRaw = object(raw.ledger);
  const entries = array(ledgerRaw.participants, 100);
  if (entries.length !== 100) throw Error("Incomplete participant ledger.");
  const ledgerParticipants = entries.map((entry, id) => {
    const template = initial.ledger.participants[id];
    const p = numericFields(entry, template, ["reliefEligible", "taxBeforeRelief", "taxRelief", "reliefTaxBase", "reliefTaxesPaid"]);
    if (p.participantId !== id || (p.reliefEligible !== undefined && p.reliefEligible !== 0 && p.reliefEligible !== 1))
      throw Error("Invalid ledger identity or relief eligibility.");
    if (experiment.taxRelief && currentRound > 0 && [p.reliefEligible, p.taxBeforeRelief, p.taxRelief, p.reliefTaxBase, p.reliefTaxesPaid].some(v => v === undefined))
      throw Error("Missing tax relief accounting.");
    if (p.taxBeforeRelief !== undefined) close(p.taxBeforeRelief, p.taxesPaid + (p.taxRelief ?? 0), "participant tax relief");
    return p;
  });
  const { participants: _participants, ...aggregateTemplate } = initial.ledger;
  const aggregates = numericFields(ledgerRaw, aggregateTemplate, ["taxBeforeRelief", "taxRelief"]);
  const ledger = { ...aggregates, participants: ledgerParticipants };
  const sum = (key: keyof typeof ledgerParticipants[number]) => ledgerParticipants.reduce((s, p) => s + (p[key] ?? 0), 0);
  close(ledger.totalTransfers, sum("transferGains"), "transfer gains");
  close(ledger.totalTransfers, sum("transferLosses"), "transfer losses");
  close(ledger.externalWealthCreated, sum("externalGains"), "external gains");
  close(ledger.externalWealthDestroyed, sum("externalLosses"), "external losses");
  close(ledger.taxesCollected, sum("taxesPaid"), "tax collections");
  close(ledger.redistributionPaid, sum("transfersReceived"), "redistribution");
  close(ledger.redistributionPaid, experiment.redistribution.type === "retain" ? 0 : ledger.taxesCollected, "fiscal balance");
  for (const key of ["taxBeforeRelief", "taxRelief"] as const)
    if (ledger[key] !== undefined || (experiment.taxRelief && currentRound > 0)) close(ledger[key] ?? NaN, sum(key), key);
  const result: SimulationState = {
    ...(experiment.version === 2 ? { modelVersion: 2 as const } : {}),
    ...(raw.treasury !== undefined ? { treasury: number(raw.treasury, "Treasury") } : {}),
    round: currentRound, randomState, participants: population, ledger, metrics,
  };
  if (experiment.redistribution.type === "retain" && result.treasury === undefined) throw Error("Missing Treasury balance.");
  number(metrics.totalWealth + (result.treasury ?? 0), "total modeled wealth");
  if (currentRound === 0) {
    if (randomState !== experiment.seed || population.some(p => p.wealth !== experiment.initialWealth) || (result.treasury ?? 0) !== 0 || Object.values(aggregates).some(v => v !== 0))
      throw Error("Invalid initial state.");
  }
  return result;
}

export function parseWorkspaceFile(contents: string): Workspace {
  if (contents.length > WORKSPACE_FILE_LIMIT) throw Error("Workspace file exceeds 50 MiB.");
  const file = object(JSON.parse(contents));
  if (file.format !== "wealth-lab-workspace" || file.version !== 1) throw Error("Unsupported workspace file format/version.");
  const scenarios: Scenario[] = array(file.scenarios, SCENARIO_LIMIT).map(entry => {
    const raw = object(entry);
    const applied = config(raw.config), draft = config(raw.draft);
    const current = state(raw.state, applied);
    const reference = object(raw.mobilityReference);
    const referenceRound = round(reference.round);
    if (referenceRound > current.round) throw Error("Mobility reference is in the future.");
    const history = array(raw.history, HISTORY_LIMIT).map((point): HistoryPoint => {
      const r = object(point);
      const metrics = numericFields(r, reportedMetrics(current));
      for (const key of ["gini", "top1Share", "top5Share", "top10Share", "bottom50Share"] as const)
        // Preserve the exact reported value, including harmless summation error.
        number(metrics[key], key, 1 + NUMERICAL_TOLERANCE);
      number(metrics.zeroWealthCount, "zero-wealth count", 100, true);
      close(metrics.totalModeledWealth, metrics.totalWealth + metrics.treasury, "historical total wealth");
      return { ...metrics, round: round(r.round) };
    });
    if (!history.length || history.at(-1)!.round !== current.round || history.some((p, i) => i > 0 && p.round !== history[i-1].round + 1))
      throw Error("History must be contiguous and end at the current round.");
    for (const [key, value] of Object.entries(reportedMetrics(current))) close((history.at(-1)! as unknown as Record<string, number>)[key], value, `latest history ${key}`);
    const previous = history.at(-2);
    if (previous) {
      const latest = history.at(-1)!;
      const ledger = current.ledger;
      // Normalize before subtraction to handle cancellation and near-limit balances.
      const fiscalScale = Math.max(1, previous.treasury, latest.treasury, ledger.taxesCollected, ledger.redistributionPaid);
      close(
        latest.treasury / fiscalScale - previous.treasury / fiscalScale,
        ledger.taxesCollected / fiscalScale - ledger.redistributionPaid / fiscalScale,
        "Treasury change"
      );
      const wealthScale = Math.max(1, previous.totalModeledWealth, latest.totalModeledWealth, ledger.externalWealthCreated, ledger.externalWealthDestroyed);
      close(
        latest.totalModeledWealth / wealthScale - previous.totalModeledWealth / wealthScale,
        ledger.externalWealthCreated / wealthScale - ledger.externalWealthDestroyed / wealthScale,
        "total modeled wealth change"
      );
    }
    const speed = number(raw.speed, "speed");
    if (![1, 5, 20, 100].includes(speed)) throw Error("Unsupported playback speed.");
    if (typeof raw.running !== "boolean") throw Error("Missing playback status.");
    if (raw.stopAt !== null) round(raw.stopAt);
    return { id: number(raw.id, "scenario ID", Number.MAX_SAFE_INTEGER - 1, true), name: text(raw.name, 80), config: applied, draft,
      state: current, history, mobilityReference: { round: referenceRound, participants: participants(reference.participants) },
      running: false, stopAt: null, speed, targetRound: round(raw.targetRound), error: text(raw.error, 2000) };
  });
  if (scenarios.some(s => s.id < 1) || new Set(scenarios.map(s => s.id)).size !== scenarios.length) throw Error("Invalid or duplicate scenario IDs.");
  if (file.selectedId !== null && !scenarios.some(s => s.id === file.selectedId)) throw Error("Selected scenario is missing.");
  const nextId = number(file.nextId, "next scenario ID", Number.MAX_SAFE_INTEGER, true);
  if (nextId <= Math.max(0, ...scenarios.map(s => s.id))) throw Error("Invalid next scenario ID.");
  return { scenarios, selectedId: file.selectedId as number | null, nextId, playbackEpoch: 0 };
}

export function serializeWorkspaceFile(workspace: Workspace): string {
  const contents = JSON.stringify({ format: "wealth-lab-workspace", version: 1, selectedId: workspace.selectedId, nextId: workspace.nextId, scenarios: workspace.scenarios });
  parseWorkspaceFile(contents); // Refuse invalid drafts/targets instead of silently losing them to JSON nulls.
  return contents;
}
