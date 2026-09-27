import { reportedMetrics } from "../simulation/metrics";
import { Field, Help, explanations } from "./Help";
import { useState } from "react";
import {
  comparisonMetrics,
  configurationEntries,
  formatMetric,
} from "../comparison";
import { scenarioName, hasPendingChanges, type Scenario } from "../workspace";
import type { ReportedMetrics } from "../simulation/types";
import { ComparisonCharts } from "./ComparisonCharts";
import { NumberField } from "./Composer";

export function Comparison({
  scenarios,
  active,
}: {
  scenarios: Scenario[];
  active: boolean;
}) {
  const [excluded, setExcluded] = useState<number[]>([]);
  const [referenceId, setReferenceId] = useState<number | null>(null);
  const [metric, setMetric] = useState<keyof ReportedMetrics>("gini");
  const [historical, setHistorical] = useState(false);
  const [round, setRound] = useState(0);
  const included = scenarios.filter((s) => !excluded.includes(s.id));
  const reference = included.find((s) => s.id === referenceId) ?? included[0];
  const latestCommonRound = included.length
    ? Math.min(...included.map((s) => s.state.round))
    : 0;
  const earliestCommonRound = included.length ? Math.max(...included.map(s => s.history[0].round)) : 0;
  const validRound =
    !historical ||
    (Number.isSafeInteger(round) && round >= earliestCommonRound && round <= latestCommonRound);
  const mismatched = new Set(included.map((s) => s.state.round)).size > 1;
  const configurations = included.map((s) => configurationEntries(s.config));
  const parameterNames = [
    ...new Set(configurations.flatMap((config) => Object.keys(config))),
  ];
  const changedParameters = parameterNames.filter(
    (key) =>
      new Set(configurations.map((config) => config[key] ?? "Not configured"))
        .size > 1
  );
  const referenceConfig = reference
    ? configurationEntries(reference.config)
    : {};
  const metricsFor = (scenario: Scenario) =>
    historical ? scenario.history.find(point => point.round === round)! : reportedMetrics(scenario.state);

  return (
    <div className="comparison-view">
      <div className="panel comparison-controls">
        <p className="eyebrow">THE COMPARISON</p>
        <h2>Change one rule. Compare the results.</h2>
        <p className="hint">
          All scenarios are paused here. Results use applied configurations;
          pending edits are not included. Only the latest 2,000 rounds per scenario are retained.
        </p>
        {!scenarios.length ? (
          <p className="empty-state">
            No scenarios yet. Use New scenario to start an experiment.
          </p>
        ) : (
          <>
            <fieldset className="scenario-selection">
              <legend>Include scenarios</legend>
              {scenarios.map((s) => (
                <label className="check" key={s.id}>
                  <input
                    type="checkbox"
                    checked={!excluded.includes(s.id)}
                    onChange={(event) =>
                      setExcluded(
                        event.target.checked
                          ? excluded.filter((id) => id !== s.id)
                          : [...excluded, s.id]
                      )
                    }
                  />
                  <span>
                    #{s.id} {scenarioName(s)}{" "}
                    <small>
                      · round {s.state.round} · seed {s.config.seed}
                      {hasPendingChanges(s) ? " · pending edits" : ""}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="comparison-options">
              <Field
                label="Reference scenario"
                help={explanations["Reference scenario"]}
              >
                {(id, descriptionId) => (
                  <select
                    id={id}
                    aria-describedby={descriptionId}
                    disabled={!included.length}
                    value={reference?.id ?? ""}
                    onChange={(event) =>
                      setReferenceId(Number(event.target.value))
                    }
                  >
                    {!included.length && (
                      <option value="">No scenarios selected</option>
                    )}
                    {included.map((s) => (
                      <option key={s.id} value={s.id}>
                        #{s.id} {scenarioName(s)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field
                label="History metric"
                help={explanations["History metric"]}
              >
                {(id, descriptionId) => (
                  <select
                    id={id}
                    aria-describedby={descriptionId}
                    value={metric}
                    onChange={(event) =>
                      setMetric(event.target.value as keyof ReportedMetrics)
                    }
                  >
                    {comparisonMetrics.map((row) => (
                      <option key={row.key} value={row.key}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Table rounds" help={explanations["Table rounds"]}>
                {(id, descriptionId) => (
                  <select
                    id={id}
                    aria-describedby={descriptionId}
                    value={historical ? "historical" : "current"}
                    onChange={(event) => {
                      setHistorical(event.target.value === "historical");
                      setRound(latestCommonRound);
                    }}
                  >
                    <option value="current">
                      Current round of each scenario
                    </option>
                    <option value="historical">Same historical round</option>
                  </select>
                )}
              </Field>
              {historical && (
                <NumberField
                  label="Comparison round"
                  value={round}
                  min={earliestCommonRound}
                  max={latestCommonRound}
                  step={1}
                  onChange={setRound}
                />
              )}
            </div>
          </>
        )}
      </div>
      {scenarios.length > 0 && !included.length && (
        <p className="notice">Select at least one scenario to compare.</p>
      )}
      {included.length > 0 && (
        <>
          {mismatched && (
            <p className="notice" role="status">
              Different current rounds:{" "}
              {included.map((s) => `#${s.id}: ${s.state.round}`).join("; ")}.
              Current distributions are not matched-round comparisons. Run each
              scenario to the same target, or use a common historical round for
              the table.
            </p>
          )}
          {!validRound && (
            <p className="notice error" role="alert">
              Choose a retained comparison round from {earliestCommonRound} to {latestCommonRound}. If that range is empty, there is no shared retained round. No
              values are extrapolated.
            </p>
          )}
          {validRound && (
            <article className="panel comparison-table-panel">
              <h2>Outcomes & differences</h2>
              <p className="hint">
                Reference: #{reference.id} {scenarioName(reference)}.
                Differences are scenario minus reference. Shares use percentage
                points (pp); Gini differences are absolute. A positive
                difference is not automatically better.
              </p>
              {historical && (
                <p className="hint">
                  Table: round {round} for every scenario. Distribution charts
                  below still show current rounds.
                </p>
              )}
              <div
                className="table-scroll"
                role="region"
                aria-label="Scenario outcomes"
                tabIndex={0}
              >
                <table>
                  <caption>
                    {historical
                      ? `Outcomes at round ${round}`
                      : "Outcomes at each scenario’s current round"}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Metric</th>
                      {included.map((s) => (
                        <th scope="col" key={s.id}>
                          #{s.id} {scenarioName(s)}
                          {s.id === reference.id && <small>Reference</small>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Round</th>
                      {included.map((s) => (
                        <td key={s.id}>{historical ? round : s.state.round}</td>
                      ))}
                    </tr>
                    <tr>
                      <th scope="row">Seed</th>
                      {included.map((s) => (
                        <td key={s.id}>{s.config.seed}</td>
                      ))}
                    </tr>
                    {comparisonMetrics.map((row) => (
                      <tr key={row.key}>
                        <th scope="row" aria-label={row.label}>
                          {row.label}{" "}
                          <Help label={row.label}>
                            {explanations[row.label]}
                          </Help>
                        </th>
                        {included.map((s) => {
                          const value = metricsFor(s)[row.key];
                          const difference =
                            value - metricsFor(reference)[row.key];
                          return (
                            <td key={s.id}>
                              <span>{formatMetric(value, row.unit)}</span>
                              {s.id !== reference.id && (
                                <small
                                  className={
                                    difference === 0
                                      ? "difference"
                                      : "difference changed"
                                  }
                                >
                                  Δ {formatMetric(difference, row.unit, true)}
                                </small>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          )}
          <article className="panel comparison-table-panel">
            <h2>Changed parameters</h2>
            <p className="hint">
              Applied rules only. Differences are highlighted against the
              reference; rounds and outcomes do not change these settings.
            </p>
            {!changedParameters.length ? (
              <p className="empty-state">
                No configuration differences among the selected scenarios.
              </p>
            ) : (
              <div
                className="table-scroll"
                role="region"
                aria-label="Configuration differences"
                tabIndex={0}
              >
                <table>
                  <caption>
                    Parameters that differ between selected scenarios
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Parameter</th>
                      {included.map((s) => (
                        <th scope="col" key={s.id}>
                          #{s.id} {scenarioName(s)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {changedParameters.map((key) => (
                      <tr key={key}>
                        <th scope="row">{key}</th>
                        {included.map((s, i) => {
                          const value =
                            configurations[i][key] ?? "Not configured";
                          const changed =
                            value !==
                            (referenceConfig[key] ?? "Not configured");
                          return (
                            <td
                              key={s.id}
                              className={changed ? "parameter-changed" : ""}
                            >
                              {value}
                              {changed && (
                                <small>Different from reference</small>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
          {active && <ComparisonCharts scenarios={included} metric={metric} />}
          <p className="hint comparison-footnote">
            Equal seeds reproduce a configuration. Different mechanisms or
            wealth-dependent selection can change which events occur. These are
            individual trajectories, not estimates over repeated runs.
          </p>
        </>
      )}
    </div>
  );
}
