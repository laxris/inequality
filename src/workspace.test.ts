import { describe, expect, it } from "vitest";
import { createWorkspace, workspaceReducer, type Workspace } from "./workspace";
import { presets } from "./simulation/presets";
import { runRounds } from "./simulation/engine";

const initial = () => createWorkspace(presets[6].experiment);
const tick = (workspace: Workspace) =>
  workspaceReducer(workspace, {
    type: "tick",
    id: workspace.selectedId!,
    epoch: workspace.playbackEpoch,
  });

describe("scenario isolation and playback", () => {
  it("clones applied rules into independent paused state at round zero", () => {
    let workspace = initial();
    workspace = workspaceReducer(workspace, { type: "step", id: 1 });
    const source = workspace.scenarios[0];
    const copy = structuredClone(source);
    workspace = workspaceReducer(workspace, { type: "clone", id: 1 });
    const clone = workspace.scenarios[1];
    expect(source).toEqual(copy);
    expect(clone.state.round).toBe(0);
    expect(clone.running).toBe(false);
    expect(clone.config).toEqual(source.config);
    expect(clone.config).not.toBe(source.config);
    expect(clone.config.externalProcesses[0]).not.toBe(
      source.config.externalProcesses[0],
    );
    expect(clone.draft).not.toBe(clone.config);
    expect(clone.history).not.toBe(source.history);
    expect(clone.state.participants[0]).not.toBe(source.state.participants[0]);
    workspace = workspaceReducer(workspace, { type: "step", id: clone.id });
    expect(workspace.scenarios[1].state).toEqual(source.state);
    expect(workspace.scenarios[0]).toEqual(copy);
  });

  it("ignores stale ticks after switching, pausing, restarting or resetting", () => {
    let workspace = initial();
    workspace = workspaceReducer(workspace, { type: "toggle", id: 1 });
    const stale = {
      type: "tick" as const,
      id: 1,
      epoch: workspace.playbackEpoch,
    };
    workspace = tick(workspace);
    const state = structuredClone(workspace.scenarios[0].state);
    workspace = workspaceReducer(workspace, { type: "select", id: null });
    expect(workspaceReducer(workspace, stale)).toBe(workspace);
    expect(workspace.scenarios[0].running).toBe(false);
    workspace = workspaceReducer(workspace, { type: "select", id: 1 });
    expect(workspace.scenarios[0].state).toEqual(state);
    expect(workspace.scenarios[0].running).toBe(false);
    workspace = workspaceReducer(workspace, { type: "toggle", id: 1 });
    expect(workspaceReducer(workspace, stale)).toBe(workspace);
    const beforeReset = {
      type: "tick" as const,
      id: 1,
      epoch: workspace.playbackEpoch,
    };
    workspace = workspaceReducer(workspace, {
      type: "reset",
      id: 1,
      config: workspace.scenarios[0].config,
    });
    expect(workspaceReducer(workspace, beforeReset)).toBe(workspace);
    expect(workspace.scenarios[0].state).toEqual(initial().scenarios[0].state);
  });

  it("never advances an inactive scenario and preserves drafts and histories", () => {
    let workspace = workspaceReducer(initial(), { type: "clone", id: 1 });
    workspace = workspaceReducer(workspace, {
      type: "edit",
      id: 2,
      config: { ...workspace.scenarios[1].draft, seed: 9 },
    });
    const second = structuredClone(workspace.scenarios[1]);
    workspace = workspaceReducer(workspace, { type: "select", id: 1 });
    workspace = workspaceReducer(workspace, { type: "toggle", id: 1 });
    workspace = tick(tick(workspace));
    expect(workspace.scenarios[1]).toEqual(second);
    expect(workspaceReducer(workspace, { type: "step", id: 2 })).toBe(
      workspace,
    );
    expect(workspaceReducer(workspace, { type: "toggle", id: 2 })).toBe(
      workspace,
    );
    workspace = workspaceReducer(workspace, { type: "select", id: 2 });
    expect(workspaceReducer(workspace, { type: "step", id: 2 })).toBe(
      workspace,
    ); // Pending edit.
    expect(workspace.scenarios[1]).toEqual(second);
  });

  it("runs to a target exactly, including a partial final batch, with partition equivalence", () => {
    let workspace = initial();
    const source = workspace.scenarios[0];
    workspace = workspaceReducer(workspace, { type: "speed", id: 1, value: 5 });
    workspace = workspaceReducer(workspace, {
      type: "target",
      id: 1,
      value: 12,
    });
    workspace = workspaceReducer(workspace, { type: "run-to-target", id: 1 });
    workspace = tick(workspace);
    workspace = workspaceReducer(workspace, { type: "select", id: null });
    workspace = workspaceReducer(workspace, { type: "select", id: 1 });
    workspace = workspaceReducer(workspace, { type: "run-to-target", id: 1 });
    workspace = tick(tick(workspace));
    expect(workspace.scenarios[0].running).toBe(false);
    expect(workspace.scenarios[0].state).toEqual(
      runRounds(source.state, source.config, 12),
    );
    expect(workspace.scenarios[0].history.map((p) => p.round)).toEqual(
      Array.from({ length: 13 }, (_, i) => i),
    );
    expect(tick(workspace)).toBe(workspace);
    workspace = workspaceReducer(workspace, {
      type: "target",
      id: 1,
      value: NaN,
    });
    expect(workspaceReducer(workspace, { type: "run-to-target", id: 1 })).toBe(
      workspace,
    );
  });

  it("deletes a running scenario without disturbing another run, and supports an empty workspace", () => {
    let workspace = workspaceReducer(initial(), { type: "clone", id: 1 });
    workspace = workspaceReducer(workspace, { type: "toggle", id: 2 });
    const source = structuredClone(workspace.scenarios[0]);
    const stale = {
      type: "tick" as const,
      id: 2,
      epoch: workspace.playbackEpoch,
    };
    workspace = workspaceReducer(workspace, { type: "delete", id: 2 });
    expect(workspace.scenarios).toEqual([source]);
    expect(workspace.selectedId).toBe(1);
    expect(workspaceReducer(workspace, stale)).toBe(workspace);
    workspace = workspaceReducer(workspace, { type: "delete", id: 1 });
    expect(workspace.selectedId).toBe(null);
    expect(workspace.scenarios).toEqual([]);
    workspace = workspaceReducer(workspace, {
      type: "add",
      config: presets[0].experiment,
    });
    expect(workspace.scenarios[0].id).toBe(3); // Deleted IDs are never reused.
    expect(workspace.selectedId).toBe(3);
  });

  it("changes only the clone when comparing bottom 20% with bottom 50%", () => {
    let workspace = initial();
    workspace = workspaceReducer(workspace, { type: "clone", id: 1 });
    const config = {
      ...workspace.scenarios[1].config,
      redistribution: { type: "bottom" as const, fraction: 0.5 },
    };
    workspace = workspaceReducer(workspace, { type: "reset", id: 2, config });
    for (const id of [1, 2]) {
      workspace = workspaceReducer(workspace, { type: "select", id });
      workspace = workspaceReducer(workspace, {
        type: "speed",
        id,
        value: 100,
      });
      workspace = workspaceReducer(workspace, { type: "run-to-target", id });
      workspace = tick(workspace);
    }
    const [first, second] = workspace.scenarios;
    expect(first.state.round).toBe(100);
    expect(second.state.round).toBe(100);
    expect(first.state).toEqual(
      runRounds(initial().scenarios[0].state, first.config, 100),
    );
    expect(second.state).toEqual(
      runRounds(initial().scenarios[0].state, second.config, 100),
    );
    expect(first.state.metrics.gini).not.toBe(second.state.metrics.gini);
    expect(first.config.redistribution).toEqual({
      type: "bottom",
      fraction: 0.2,
    });
    expect(second.config.redistribution).toEqual({
      type: "bottom",
      fraction: 0.5,
    });
  });
});
