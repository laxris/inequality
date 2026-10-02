import { expect, it } from "vitest";
import { createWorkspace, workspaceReducer, HISTORY_LIMIT } from "./workspace";
import { parseWorkspaceFile, serializeWorkspaceFile } from "./workspaceFile";
import { presets } from "./simulation/presets";
import { runRounds } from "./simulation/engine";

it("round-trips every preset and fiscal configuration with identical continuation in both random models", () => {
  for (const version of [1, 2] as const) for (const preset of presets) {
    for (const retain of [false, true]) {
      const config = { ...preset.experiment, version,
        ...(retain ? { redistribution: { type: "retain" as const }, taxRelief: {
          eligibility: "wealthiest" as const, fraction: .05, discount: .8, affectedTax: "all" as const,
        } } : {}),
      };
      let workspace = createWorkspace(config);
      for (let i = 0; i < 7; i++) workspace = workspaceReducer(workspace, { type: "step", id: 1 });
      workspace = workspaceReducer(workspace, { type: "mobility-reference", id: 1 });
      workspace = workspaceReducer(workspace, { type: "toggle", id: 1 });
      const restored = parseWorkspaceFile(serializeWorkspaceFile(workspace));
      const source = workspace.scenarios[0], saved = restored.scenarios[0];
      expect(saved).toEqual({ ...source, running: false, stopAt: null });
      expect(runRounds(saved.state, saved.config, 9)).toEqual(runRounds(source.state, source.config, 9));
      const stale = { type: "tick" as const, id: 1, epoch: workspace.playbackEpoch };
      const replaced = workspaceReducer(workspace, { type: "restore", workspace: restored });
      expect(workspaceReducer(replaced, stale)).toBe(replaced);
    }
  }
});

it("rejects malformed files, inconsistent accounts, unsupported enums and invalid drafts", () => {
  const workspace = createWorkspace(presets[6].experiment);
  const valid = serializeWorkspaceFile(workspace);
  for (const corrupt of [
    (file: { version: number; scenarios: typeof workspace.scenarios }) => { file.version = 99; },
    (file: { version: number; scenarios: typeof workspace.scenarios }) => { file.scenarios[0].state.participants[0].wealth = -1; },
    (file: { version: number; scenarios: typeof workspace.scenarios }) => { file.scenarios[0].state.metrics.totalWealth = 3; },
    (file: { version: number; scenarios: typeof workspace.scenarios }) => { file.scenarios[0].state.ledger.taxesCollected = 1; },
    (file: { version: number; scenarios: typeof workspace.scenarios }) => { file.scenarios[0].history = []; },
    (file: { version: number; scenarios: typeof workspace.scenarios }) => { Object.assign(file.scenarios[0].config.externalProcesses[0], { capitalMode: ["proportional"] }); },
  ]) {
    const file = JSON.parse(valid); corrupt(file);
    expect(() => parseWorkspaceFile(JSON.stringify(file))).toThrow();
  }
  workspace.scenarios[0].draft.seed = NaN;
  expect(() => serializeWorkspaceFile(workspace)).toThrow();
});

it("bounds live batches and history without altering simulation outcomes", () => {
  let workspace = createWorkspace(presets[0].experiment);
  const original = workspace.scenarios[0];
  workspace = workspaceReducer(workspace, { type: "speed", id: 1, value: 100 });
  workspace = workspaceReducer(workspace, { type: "target", id: 1, value: HISTORY_LIMIT + 7 });
  workspace = workspaceReducer(workspace, { type: "run-to-target", id: 1 });
  while (workspace.scenarios[0].running) {
    const before = workspace.scenarios[0].state.round;
    workspace = workspaceReducer(workspace, { type: "tick", id: 1, epoch: workspace.playbackEpoch });
    expect(workspace.scenarios[0].state.round - before).toBeLessThanOrEqual(5);
  }
  const result = workspace.scenarios[0];
  expect(result.history).toHaveLength(HISTORY_LIMIT);
  expect(result.history[0].round).toBe(8);
  expect(result.state).toEqual(runRounds(original.state, original.config, HISTORY_LIMIT + 7));
  expect(parseWorkspaceFile(serializeWorkspaceFile(workspace)).scenarios[0]).toEqual(result);
});

it("round-trips a valid share slightly above one without changing the saved trajectory", () => {
  const config = {
    ...presets[0].experiment,
    version: 2 as const,
    seed: 0,
    transfers: [],
    externalProcesses: [{
      type: "multiplicative-returns" as const,
      investmentFraction: 1,
      successProbability: 0.8,
      successReturn: 0.4,
      failureReturn: -1,
    }],
  };
  let workspace = createWorkspace(config);
  for (let i = 0; i < 12; i++) workspace = workspaceReducer(workspace, { type: "step", id: 1 });
  const source = workspace.scenarios[0];
  expect(source.state.metrics.top10Share).toBeGreaterThan(1);
  const contents = serializeWorkspaceFile(workspace);
  const restored = parseWorkspaceFile(contents).scenarios[0];
  expect(restored).toEqual(source);
  expect(runRounds(restored.state, restored.config, 9)).toEqual(runRounds(source.state, source.config, 9));
  const file = JSON.parse(contents);
  file.scenarios[0].history[0].top10Share = 1.001;
  expect(() => parseWorkspaceFile(JSON.stringify(file))).toThrow("top10Share");
});

it("reconciles the latest Treasury and modeled wealth changes with the ledger", () => {
  for (const version of [1, 2] as const) for (const retain of [false, true]) {
    let workspace = createWorkspace({
      ...presets[0].experiment,
      version,
      transfers: [],
      externalProcesses: [{ type: "independent-shocks", amount: 50 }],
      taxes: [{ type: "wealth-tax", rate: 0.01, exemption: 0 }],
      redistribution: { type: retain ? "retain" : "universal" },
    });
    for (let i = 0; i < 2; i++) workspace = workspaceReducer(workspace, { type: "step", id: 1 });
    const contents = serializeWorkspaceFile(workspace);
    expect(parseWorkspaceFile(contents).scenarios[0]).toEqual(workspace.scenarios[0]);

    const missingTreasury = JSON.parse(contents);
    const scenario = missingTreasury.scenarios[0];
    const treasury = retain ? 0 : 1000;
    scenario.state.treasury = treasury;
    scenario.history.at(-1).treasury = treasury;
    scenario.history.at(-1).totalModeledWealth = scenario.state.metrics.totalWealth + treasury;
    expect(() => parseWorkspaceFile(JSON.stringify(missingTreasury))).toThrow("Treasury change");

    const missingWealth = JSON.parse(contents);
    const previous = missingWealth.scenarios[0].history.at(-2);
    previous.totalWealth += 1000;
    previous.totalModeledWealth += 1000;
    expect(() => parseWorkspaceFile(JSON.stringify(missingWealth))).toThrow("total modeled wealth change");
  }
});
