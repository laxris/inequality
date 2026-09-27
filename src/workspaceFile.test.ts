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
