import { useEffect, useReducer, useState } from "react";
import { ScenarioView } from "./components/ScenarioView";
import { Comparison } from "./components/Comparison";
import { Experiments } from "./components/Experiments";
import { Help } from "./components/Help";
import { validateExperiment } from "./simulation/config";
import { presets } from "./simulation/presets";
import type { Experiment } from "./simulation/types";
import {
  createWorkspace,
  hasPendingChanges,
  scenarioName,
  workspaceReducer,
} from "./workspace";
function loadExperiment(): { config: Experiment; error: string } {
  try {
    const encoded = new URLSearchParams(window.location.search).get(
      "experiment"
    );
    if (!encoded)
      return { config: structuredClone(presets[0].experiment), error: "" };
    const config: unknown = JSON.parse(encoded);
    validateExperiment(config);
    // The first composer exposes one of each control; don't silently hide imported rules.
    if (
      config.transfers.length > 1 ||
      config.externalProcesses.length > 1 ||
      config.taxes.length > 2 ||
      config.taxes.filter((t) => t.type === "income-tax").length > 1 ||
      config.taxes.filter((t) => t.type === "wealth-tax").length > 1 ||
      (config.taxes.length === 2 && config.taxes[0].type !== "income-tax")
    ) {
      throw new Error(
        "This composer supports one transfer, one external process, and income tax before wealth tax."
      );
    }
    return { config, error: "" };
  } catch (error) {
    return {
      config: structuredClone(presets[0].experiment),
      error: `Could not load shared experiment: ${
        error instanceof Error ? error.message : "Invalid configuration."
      }`,
    };
  }
}

export default function App() {
  const [initial] = useState(loadExperiment);
  const [mode, setMode] = useState<"scenarios" | "experiments">("scenarios");
  const [workspace, dispatch] = useReducer(
    workspaceReducer,
    initial.config,
    createWorkspace
  );
  const selected = workspace.scenarios.find(
    (s) => s.id === workspace.selectedId
  );
  const activeId = selected?.id;
  const running = mode === "scenarios" && (selected?.running ?? false);
  const epoch = workspace.playbackEpoch;
  useEffect(() => {
    if (!running || activeId === undefined) return;
    const timer = window.setInterval(
      () => dispatch({ type: "tick", id: activeId, epoch }),
      200
    );
    return () => window.clearInterval(timer);
  }, [activeId, running, epoch]);
  useEffect(() => {
    document
      .getElementById(`tab-${workspace.selectedId ?? "comparison"}`)
      ?.focus();
  }, [workspace.selectedId]);

  const tabs = [
    ...workspace.scenarios.map((s) => ({
      id: s.id as number | null,
      label: scenarioName(s),
      round: s.state.round,
    })),
    { id: null, label: "Comparison", round: undefined },
  ];
  return (
    <main>
      <header className="site-header">
        <a className="brand" href={window.location.pathname}>
          <span className="brand-mark">w.</span> WEALTH LAB
        </a>
        <span className="badge">A distribution experiment</span>
      </header>
      <section className="intro">
        <p className="eyebrow">SIMPLE RULES. UNEQUAL OUTCOMES?</p>
        <h1>
          Start equal.
          <br />
          <span>See what changes.</span>
        </h1>
        <p>
          Build a scenario, clone it, and change one rule. Compare the outcomes
          of a hundred participants with a shared starting point.
        </p>
      </section>
      <div className="mode-switch" role="group" aria-label="Workspace mode">
        <button
          aria-pressed={mode === "scenarios"}
          onClick={() => setMode("scenarios")}
        >
          Scenarios
        </button>
        <button
          aria-pressed={mode === "experiments"}
          onClick={() => {
            dispatch({ type: "pause-all" });
            setMode("experiments");
          }}
        >
          Experiments
        </button>
        <Help label="Workspace modes">
          Scenarios explain individual trajectories. Experiments rerun a control
          and treatment across many matched seeds and summarize paired effects.
          Switching to Experiments pauses scenario playback; leaving Experiments
          cancels a running batch.
        </Help>
      </div>
      <div hidden={mode !== "scenarios"}>
        <div className="scenario-navigation">
          <div role="tablist" aria-label="Scenarios" className="scenario-tabs">
            {tabs.map((tab, index) => (
              <button
                key={tab.id ?? "comparison"}
                role="tab"
                id={`tab-${tab.id ?? "comparison"}`}
                aria-controls={`panel-${tab.id ?? "comparison"}`}
                aria-selected={workspace.selectedId === tab.id}
                tabIndex={workspace.selectedId === tab.id ? 0 : -1}
                onClick={() => dispatch({ type: "select", id: tab.id })}
                onKeyDown={(event) => {
                  const next =
                    event.key === "ArrowRight"
                      ? (index + 1) % tabs.length
                      : event.key === "ArrowLeft"
                      ? (index + tabs.length - 1) % tabs.length
                      : event.key === "Home"
                      ? 0
                      : event.key === "End"
                      ? tabs.length - 1
                      : -1;
                  if (next >= 0) {
                    event.preventDefault();
                    dispatch({ type: "select", id: tabs[next].id });
                  }
                }}
              >
                <span>{tab.label}</span>
                {tab.round !== undefined && (
                  <small aria-hidden="true">Round {tab.round}</small>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() =>
              dispatch({ type: "add", config: presets[0].experiment })
            }
          >
            New scenario
          </button>
        </div>
        <p className="hint workspace-note">
          Only the selected scenario can run. Switching tabs pauses playback.
          Scenarios are kept in this page until reload.
        </p>
        {initial.error && (
          <p className="notice" role="status">
            {initial.error}
          </p>
        )}
        {workspace.scenarios.map((scenario) => (
          <section
            key={scenario.id}
            role="tabpanel"
            id={`panel-${scenario.id}`}
            aria-labelledby={`tab-${scenario.id}`}
            hidden={workspace.selectedId !== scenario.id}
            tabIndex={0}
          >
            {workspace.selectedId === scenario.id && (
              <>
                <div className="scenario-toolbar">
                  <label className="field">
                    <span>Scenario name</span>
                    <input
                      value={scenario.name}
                      maxLength={80}
                      placeholder={`Scenario ${scenario.id}`}
                      onChange={(event) =>
                        dispatch({
                          type: "rename",
                          id: scenario.id,
                          name: event.target.value,
                        })
                      }
                    />
                  </label>
                  <button
                    disabled={hasPendingChanges(scenario)}
                    onClick={() => dispatch({ type: "clone", id: scenario.id })}
                  >
                    Clone scenario
                  </button>
                  <button
                    className="delete-button"
                    onClick={() =>
                      dispatch({ type: "delete", id: scenario.id })
                    }
                  >
                    Delete scenario
                  </button>
                  <p className="hint">
                    Clone copies the applied rules and seed into a new run at
                    round zero. Apply pending edits before cloning.
                  </p>
                </div>
                <ScenarioView session={scenario} dispatch={dispatch} />
              </>
            )}
          </section>
        ))}
        <section
          role="tabpanel"
          id="panel-comparison"
          aria-labelledby="tab-comparison"
          hidden={workspace.selectedId !== null}
          tabIndex={0}
        >
          <Comparison
            scenarios={workspace.scenarios}
            active={mode === "scenarios" && workspace.selectedId === null}
          />
        </section>
      </div>
      <div hidden={mode !== "experiments"}>
        <Experiments
          scenarios={workspace.scenarios}
          active={mode === "experiments"}
        />
      </div>
      <footer>
        <strong>A laboratory, not a forecast.</strong> These are simplified
        stochastic mechanisms, not a realistic macroeconomic model. All
        calculations run in your browser; no account or server required.
      </footer>
    </main>
  );
}
