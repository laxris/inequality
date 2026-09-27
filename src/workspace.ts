import { createSimulation, stepSimulation } from "./simulation/engine";
import { reportedMetrics } from "./simulation/metrics";
import { validateExperiment } from "./simulation/config";
import type {
  Experiment,
  Participant,
  HistoryPoint,
  SimulationState,
} from "./simulation/types";

export const SCENARIO_LIMIT = 100;
export const HISTORY_LIMIT = 2000;
export const PLAYBACK_BATCH_LIMIT = 5;

export interface Scenario {
  id: number;
  name: string;
  config: Experiment;
  draft: Experiment;
  state: SimulationState;
  history: HistoryPoint[];
  mobilityReference: { round: number; participants: Participant[] };
  running: boolean;
  speed: number;
  targetRound: number;
  stopAt: number | null;
  error: string;
}
export interface Workspace {
  scenarios: Scenario[];
  selectedId: number | null;
  nextId: number;
  playbackEpoch: number;
}
export type WorkspaceAction =
  | { type: "pause-all" }
  | { type: "restore"; workspace: Workspace }
  | { type: "select"; id: number | null }
  | { type: "add"; config: Experiment }
  | {
      type:
        | "clone"
        | "delete"
        | "step"
        | "toggle"
        | "run-to-target"
        | "mobility-reference";
      id: number;
    }
  | { type: "rename"; id: number; name: string }
  | { type: "edit" | "reset"; id: number; config: Experiment }
  | { type: "speed" | "target"; id: number; value: number }
  | { type: "tick"; id: number; epoch: number };

export const scenarioName = (scenario: Scenario) =>
  scenario.name.trim() || `Scenario ${scenario.id}`;
export const hasPendingChanges = (scenario: Scenario) =>
  JSON.stringify(scenario.draft) !== JSON.stringify(scenario.config);

function createScenario(
  id: number,
  name: string,
  config: Experiment
): Scenario {
  const applied = structuredClone(config);
  const state = createSimulation(applied);
  return {
    id,
    name,
    config: applied,
    draft: structuredClone(applied),
    state,
    history: [{ round: 0, ...reportedMetrics(state) }],
    mobilityReference: {
      round: 0,
      participants: structuredClone(state.participants),
    },
    running: false,
    speed: 1,
    targetRound: 100,
    stopAt: null,
    error: "",
  };
}
export function createWorkspace(config: Experiment): Workspace {
  return {
    scenarios: [createScenario(1, "Scenario 1", config)],
    selectedId: 1,
    nextId: 2,
    playbackEpoch: 0,
  };
}
const pause = (scenario: Scenario): Scenario =>
  scenario.running ? { ...scenario, running: false, stopAt: null } : scenario;

function advance(scenario: Scenario, rounds: number): Scenario {
  let state = scenario.state;
  const points: HistoryPoint[] = [];
  for (let round = 0; round < rounds; round++) {
    state = stepSimulation(state, scenario.config);
    points.push({ round: state.round, ...reportedMetrics(state) });
  }
  const reachedTarget =
    scenario.stopAt !== null && state.round >= scenario.stopAt;
  return {
    ...scenario,
    state,
    history: [...scenario.history, ...points].slice(-HISTORY_LIMIT),
    running: reachedTarget ? false : scenario.running,
    stopAt: reachedTarget ? null : scenario.stopAt,
    error: "",
  };
}

export function workspaceReducer(
  workspace: Workspace,
  action: WorkspaceAction
): Workspace {
  if (action.type === "restore") {
    return {
      ...action.workspace,
      playbackEpoch: workspace.playbackEpoch + 1,
      scenarios: action.workspace.scenarios.map(s => ({ ...s, running: false, stopAt: null })),
    };
  }
  // A timer queued before a tab switch, reset or pause must never advance a later run.
  if (
    action.type === "tick" &&
    (action.epoch !== workspace.playbackEpoch ||
      action.id !== workspace.selectedId)
  )
    return workspace;
  const epoch =
    action.type === "tick"
      ? workspace.playbackEpoch
      : workspace.playbackEpoch + 1;
  if (action.type === "pause-all")
    return {
      ...workspace,
      playbackEpoch: epoch,
      scenarios: workspace.scenarios.map(pause),
    };
  if (action.type === "select") {
    if (
      action.id !== null &&
      !workspace.scenarios.some((s) => s.id === action.id)
    )
      return workspace;
    if (workspace.selectedId === action.id) return workspace;
    return {
      ...workspace,
      playbackEpoch: epoch,
      selectedId: action.id,
      scenarios: workspace.scenarios.map(pause),
    };
  }
  if (action.type === "add" || action.type === "clone") {
    if (workspace.scenarios.length >= SCENARIO_LIMIT) return workspace;
    const source =
      action.type === "clone"
        ? workspace.scenarios.find((s) => s.id === action.id)
        : undefined;
    if (action.type === "clone" && !source) return workspace;
    const scenario = createScenario(
      workspace.nextId,
      source ? `${scenarioName(source)} copy`.slice(0, 80) : `Scenario ${workspace.nextId}`,
      action.type === "add" ? action.config : source!.config
    );
    if (source) {
      scenario.targetRound = source.targetRound;
      scenario.speed = source.speed;
    }
    return {
      ...workspace,
      playbackEpoch: epoch,
      scenarios: [...workspace.scenarios.map(pause), scenario],
      selectedId: scenario.id,
      nextId: scenario.id + 1,
    };
  }
  const index = workspace.scenarios.findIndex((s) => s.id === action.id);
  if (index < 0) return workspace;
  if (action.type === "delete") {
    const scenarios = workspace.scenarios.filter((s) => s.id !== action.id);
    const selectedId =
      action.id === workspace.selectedId
        ? scenarios[Math.min(index, scenarios.length - 1)]?.id ?? null
        : workspace.selectedId;
    return {
      ...workspace,
      playbackEpoch: epoch,
      scenarios: scenarios.map(pause),
      selectedId,
    };
  }
  const scenario = workspace.scenarios[index];
  let next = scenario;
  try {
    switch (action.type) {
      case "mobility-reference":
        if (workspace.selectedId !== scenario.id) return workspace;
        next = {
          ...pause(scenario),
          mobilityReference: {
            round: scenario.state.round,
            participants: structuredClone(scenario.state.participants),
          },
        };
        break;
      case "rename":
        next = { ...scenario, name: action.name.slice(0, 80) };
        break;
      case "edit":
        next = { ...pause(scenario), draft: structuredClone(action.config) };
        break;
      case "reset": {
        const fresh = createScenario(scenario.id, scenario.name, action.config);
        next = {
          ...fresh,
          speed: scenario.speed,
          targetRound: scenario.targetRound,
        };
        break;
      }
      case "speed":
        if (![1, 5, 20, 100].includes(action.value)) return workspace;
        next = { ...scenario, speed: action.value };
        break;
      case "target":
        next = { ...pause(scenario), targetRound: action.value };
        break;
      case "toggle":
      case "run-to-target":
      case "step":
      case "tick": {
        if (workspace.selectedId !== scenario.id) return workspace;
        if (action.type === "toggle" && scenario.running) {
          next = pause(scenario);
          break;
        }
        if (scenario.error || hasPendingChanges(scenario)) return workspace;
        validateExperiment(scenario.draft);
        if (action.type === "tick") {
          if (!scenario.running) return workspace;
          const rounds =
            scenario.stopAt === null
              ? Math.min(scenario.speed, PLAYBACK_BATCH_LIMIT)
              : Math.min(
                  scenario.speed, PLAYBACK_BATCH_LIMIT,
                  scenario.stopAt - scenario.state.round
                );
          next = advance(scenario, rounds);
        } else if (action.type === "step") {
          if (scenario.running) return workspace;
          next = advance(scenario, 1);
        } else if (action.type === "run-to-target") {
          if (
            !Number.isSafeInteger(scenario.targetRound) ||
            scenario.targetRound <= scenario.state.round
          )
            return workspace;
          next = { ...scenario, running: true, stopAt: scenario.targetRound };
        } else next = { ...scenario, running: true, stopAt: null };
        break;
      }
    }
  } catch (error) {
    next = {
      ...pause(scenario),
      error:
        error instanceof Error
          ? error.message
          : "Simulation could not advance.",
    };
  }
  return {
    ...workspace,
    playbackEpoch: epoch,
    scenarios: workspace.scenarios.map((s, i) => (i === index ? next : s)),
  };
}
