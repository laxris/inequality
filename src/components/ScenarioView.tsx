import { Mobility } from "./Mobility";
import { reportedMetrics, reliefIncidence } from "../simulation/metrics";
import { Help, explanations } from "./Help";
import { useState, type Dispatch } from "react";
import { Composer, NumberField } from "./Composer";
import { Charts } from "./Charts";
import {
  currency,
  ParticipantDetails,
  percent,
  WealthGrid,
} from "./WealthGrid";
import { experimentUrl, validateExperiment } from "../simulation/config";
import { presets } from "../simulation/presets";
import type { Experiment } from "../simulation/types";
import {
  hasPendingChanges,
  type Scenario,
  type WorkspaceAction,
} from "../workspace";

export function ScenarioView({
  session,
  dispatch,
}: {
  session: Scenario;
  dispatch: Dispatch<WorkspaceAction>;
}) {
  const draft = session.draft;
  const [selected, setSelected] = useState(0);
  const [presetIndex, setPresetIndex] = useState("");
  const [message, setMessage] = useState("");
  const { state } = session;
  const dirty = hasPendingChanges(session);
  let validationError = "";
  try {
    validateExperiment(draft);
  } catch (error) {
    validationError =
      error instanceof Error ? error.message : "Invalid configuration.";
  }
  function edit(config: Experiment) {
    dispatch({ type: "edit", id: session.id, config });
    setPresetIndex("");
    setMessage("");
  }
  function apply() {
    if (!validationError) {
      dispatch({ type: "reset", id: session.id, config: draft });
      setMessage("");
    }
  }
  async function share() {
    if (window.location.protocol === "file:") {
      setMessage("This is a local file. Use Export workspace JSON to share configurations and saved runs.");
      return;
    }
    try {
      const url = experimentUrl(session.config, window.location.href);
      window.history.replaceState(null, "", url);
      await navigator.clipboard.writeText(url);
      setMessage(
        "Scenario link copied. It reproduces this scenario from round zero; other tabs are not included."
      );
    } catch {
      setMessage(
        "This scenario is in the address bar. Copy that URL to share it; other tabs are not included."
      );
    }
  }
  const reported = reportedMetrics(state);
  const metrics = [
    ["Private wealth", currency(state.metrics.totalWealth)],
    ["Treasury", currency(reported.treasury)],
    ["Total modeled wealth", currency(reported.totalModeledWealth)],
    ["Top 5% share", percent(reported.top5Share)],
    ["Gini coefficient", state.metrics.gini.toFixed(3)],
    ["Top 10% share", percent(state.metrics.top10Share)],
    ["Bottom 50% share", percent(state.metrics.bottom50Share)],
    ["Mean wealth", currency(state.metrics.meanWealth)],
    ["Median wealth", currency(state.metrics.medianWealth)],
    [
      "Top 1% / richest",
      `${percent(state.metrics.top1Share)} / ${currency(
        state.metrics.richestWealth
      )}`,
    ],
    ["At zero wealth", `${state.metrics.zeroWealthCount} / 100`],
  ];

  return (
    <>
      <div className="workspace">
        <section className="simulation-column">
          <article className="panel population-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">THE POPULATION</p>
                <h2>100 lives, fixed in place</h2>
              </div>
              <div className="round">
                <span>ROUND</span>
                <strong data-testid="round">{state.round}</strong>
              </div>
            </div>
            <WealthGrid
              state={state}
              selected={selected}
              onSelect={setSelected}
            />
            <div className="grid-caption">
              <span>Circle area = share of private wealth</span>
              <span>
                <i className="dot gain" /> Gain <i className="dot loss" /> Loss{" "}
                <i className="dot neutral" /> Unchanged
              </span>
            </div>
            <div className="playback">
              <button
                className="primary"
                disabled={dirty || !!validationError || !!session.error}
                onClick={() => dispatch({ type: "toggle", id: session.id })}
              >
                {session.running ? "Pause" : "Run"}
              </button>
              <button
                disabled={
                  session.running ||
                  dirty ||
                  !!validationError ||
                  !!session.error
                }
                onClick={() => dispatch({ type: "step", id: session.id })}
              >
                Step
              </button>
              <button
                onClick={() =>
                  dispatch({
                    type: "reset",
                    id: session.id,
                    config: session.config,
                  })
                }
              >
                Reset
              </button>
              <label className="speed">
                Speed{" "}
                <select
                  value={session.speed}
                  onChange={(event) =>
                    dispatch({
                      type: "speed",
                      id: session.id,
                      value: Number(event.target.value),
                    })
                  }
                >
                  {[1, 5, 20, 100].map((value) => (
                    <option key={value} value={value}>
                      {value}×
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="target-controls">
              <NumberField
                label="Target round"
                value={session.targetRound}
                max={Number.MAX_SAFE_INTEGER}
                step={1}
                onChange={(value) =>
                  dispatch({ type: "target", id: session.id, value })
                }
              />
              <button
                disabled={
                  session.running ||
                  dirty ||
                  !!validationError ||
                  !!session.error ||
                  !Number.isSafeInteger(session.targetRound) ||
                  session.targetRound <= state.round
                }
                onClick={() =>
                  dispatch({ type: "run-to-target", id: session.id })
                }
              >
                Run to target
              </button>
              {session.stopAt !== null && (
                <span className="hint">Pauses at round {session.stopAt}.</span>
              )}
            </div>
            <p className="hint playback-note">
              Reset replays the active seed. Select a participant with pointer
              or keyboard to inspect their round.
            </p>
            <ParticipantDetails state={state} selected={selected} />
          </article>
          <section
            className="metrics"
            aria-label="Current distribution metrics"
          >
            {metrics.map(([label, value]) => (
              <article key={label}>
                <span>
                  {label} <Help label={label}>{explanations[label]}</Help>
                </span>
                <strong>{value}</strong>
              </article>
            ))}
          </section>
          <details className="panel accounting">
            <summary>Round accounting & model assumptions</summary>
            <dl className="ledger">
              <div>
                <dt>Transferred between participants</dt>
                <dd>{currency(state.ledger.totalTransfers)}</dd>
              </div>
              <div>
                <dt>External wealth created / destroyed</dt>
                <dd>
                  {currency(state.ledger.externalWealthCreated)} /{" "}
                  {currency(state.ledger.externalWealthDestroyed)}
                </dd>
              </div>
              <div>
                <dt>Taxes collected / redistributed</dt>
                <dd>
                  {currency(state.ledger.taxesCollected)} /{" "}
                  {currency(state.ledger.redistributionPaid)}
                </dd>
              </div>
              {session.config.taxRelief && (
                <>
                  <div>
                    <dt>Tax collectible before relief / actual</dt>
                    <dd>
                      {currency(state.ledger.taxBeforeRelief ?? 0)} /{" "}
                      {currency(state.ledger.taxesCollected)}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      Tax relief this round{" "}
                      <Help label="Tax relief this round">
                        {explanations["Tax relief this round"]}
                      </Help>
                    </dt>
                    <dd>{currency(state.ledger.taxRelief ?? 0)}</dd>
                  </div>
                  {[true, false].map((eligible) => {
                    const incidence = reliefIncidence(state, eligible);
                    return (
                      <div key={String(eligible)}>
                        <dt>
                          {eligible ? "Eligible group" : "Other participants"}{" "}
                          effective rate
                        </dt>
                        <dd>
                          {incidence.effectiveRate === null
                            ? "No assessed base"
                            : percent(incidence.effectiveRate)}
                        </dd>
                      </div>
                    );
                  })}
                </>
              )}
            </dl>
            {session.config.taxRelief && (
              <p className="hint">
                Effective rates are actual selected-tax payments divided by the
                selected assessed bases in each group. If both taxes are
                selected, the denominator adds gross income and taxable wealth;
                compare rates only with the same base selection. At round zero
                no tax has been assessed.
              </p>
            )}
            <p>
              Round order: transfers → external processes → taxes →
              redistribution or Treasury retention → metrics. No debt. Treasury
              starts at zero and earns no returns; distribution metrics exclude
              it. Zero-wealth participants remain eligible for exchange.
              All-zero wealth uses zero Gini and zero shares.
            </p>
            <p>
              Model v{session.config.version} ·{" "}
              {session.config.version === 2
                ? "Keyed Philox random channels"
                : "Mulberry32 sequential random stream"}{" "}
              · seed {session.config.seed}. The same seed and configuration
              reproduce the same path. Changing a mechanism can change how
              random draws are used, so different presets are not necessarily
              matched events.
            </p>
          </details>
        </section>
        <aside className="panel composer">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">THE EXPERIMENT</p>
              <h2>Choose the rules</h2>
            </div>
            <span className="small-tag">v{draft.version}</span>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              apply();
            }}
          >
            <label className="field preset">
              <span>Start with a preset</span>
              <select
                value={presetIndex}
                onChange={(event) => {
                  const index = event.target.value;
                  if (index === "") return;
                  edit({
                    ...structuredClone(presets[Number(index)].experiment),
                    seed: draft.seed,
                  });
                  setPresetIndex(index);
                }}
              >
                <option value="">Custom / current experiment</option>
                {presets.map((preset, index) => (
                  <option key={preset.name} value={index}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>
            {presetIndex !== "" && (
              <p className="preset-description">
                {presets[Number(presetIndex)].description}
              </p>
            )}
            <div className="seed-row">
              <NumberField
                label="Random seed"
                value={draft.seed}
                max={4294967295}
                step={1}
                onChange={(seed) => edit({ ...draft, seed })}
              />
              <button
                type="button"
                onClick={() =>
                  edit({
                    ...draft,
                    seed: crypto.getRandomValues(new Uint32Array(1))[0],
                  })
                }
              >
                New seed
              </button>
            </div>
            <Composer config={draft} onChange={edit} />
            <div className="apply-controls">
              {dirty && (
                <p className="hint">
                  Changes are pending. Apply to start a new run.
                </p>
              )}
              {validationError && (
                <p role="alert" className="error">
                  {validationError}
                </p>
              )}
              <button
                type="submit"
                className="primary"
                disabled={!!validationError}
              >
                Apply & reset
              </button>
              <button
                type="button"
                disabled={dirty || !!validationError}
                onClick={share}
              >
                Share experiment
              </button>
            </div>
          </form>
        </aside>
      </div>
      {(message || session.error) && (
        <p
          role={session.error ? "alert" : "status"}
          className={session.error ? "notice error" : "notice"}
        >
          {session.error || message}
        </p>
      )}
      <Charts history={session.history} state={state} />
      <Mobility
        scenario={session}
        capture={() => dispatch({ type: "mobility-reference", id: session.id })}
      />
    </>
  );
}
