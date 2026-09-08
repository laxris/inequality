import { useEffect, useRef, useState } from "react";
import { presets } from "../simulation/presets";
import {
  comparisonMetrics,
  configurationEntries,
  formatMetric,
} from "../comparison";
import { scenarioName, type Scenario } from "../workspace";
import {
  quantile,
  summarizePairs,
  validateBatch,
  type BatchMessage,
  type BatchRequest,
  type BatchResult,
  type Outcomes,
} from "../experiments/runner";
import { NumberField } from "./Composer";
import { Field, Help, explanations } from "./Help";
import { ExperimentCharts } from "./ExperimentCharts";

const outcomes = [
  ...comparisonMetrics,
  {
    key: "cumulativeTaxRelief" as const,
    label: "Cumulative tax relief",
    unit: "currency" as const,
  },
  {
    key: "cumulativeTaxes" as const,
    label: "Cumulative tax revenue",
    unit: "currency" as const,
  },
  {
    key: "cumulativeRedistribution" as const,
    label: "Cumulative redistribution",
    unit: "currency" as const,
  },
];

export function Experiments({
  scenarios,
  active,
}: {
  scenarios: Scenario[];
  active: boolean;
}) {
  const [controlId, setControlId] = useState("control");
  const [treatmentId, setTreatmentId] = useState("treatment");
  const [firstSeed, setFirstSeed] = useState(42);
  const [runs, setRuns] = useState(100);
  const [horizon, setHorizon] = useState(1000);
  const [checkpointText, setCheckpointText] = useState("100, 250, 500");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<BatchResult | null>(null);
  const [round, setRound] = useState(1000);
  const [metric, setMetric] = useState<keyof Outcomes>("gini");
  const workerRef = useRef<Worker | null>(null);
  const sourceOptions = [
    {
      id: "control",
      name: "Investment economy · no tax",
      config: { ...presets[4].experiment },
    },
    {
      id: "treatment",
      name: "Investment economy · 1% wealth tax",
      config: {
        ...presets[4].experiment,
        taxes: [{ type: "wealth-tax" as const, rate: 0.01, exemption: 0 }],
      },
    },
    ...scenarios.map((s) => ({
      id: `scenario-${s.id}`,
      name: `#${s.id} ${scenarioName(s)}`,
      config: s.config,
    })),
  ];
  const control = sourceOptions.find((s) => s.id === controlId);
  const treatment = sourceOptions.find((s) => s.id === treatmentId);
  let request: BatchRequest | null = null;
  let validationError = "";
  try {
    if (!control || !treatment)
      throw new Error(
        "Select an available control and treatment; a source scenario may have been deleted."
      );
    const checkpointValues = checkpointText.trim()
      ? checkpointText
          .split(",")
          .map((value) => (value.trim() === "" ? NaN : Number(value)))
      : [];
    request = {
      control: { ...control.config, version: 2, seed: firstSeed },
      treatment: { ...treatment.config, version: 2, seed: firstSeed },
      controlName: control.name,
      treatmentName: treatment.name,
      firstSeed,
      runs,
      horizon,
      checkpoints: [...new Set([...checkpointValues, horizon])].sort(
        (a, b) => a - b
      ),
    };
    validateBatch(request);
  } catch (cause) {
    validationError =
      cause instanceof Error ? cause.message : "Invalid experiment.";
  }
  const controlEntries = request ? configurationEntries(request.control) : {};
  const treatmentEntries = request
    ? configurationEntries(request.treatment)
    : {};
  const changed = [
    ...new Set([
      ...Object.keys(controlEntries),
      ...Object.keys(treatmentEntries),
    ]),
  ].filter((key) => controlEntries[key] !== treatmentEntries[key]);
  const selectedOutcome = outcomes.find((row) => row.key === metric)!;

  function cancel() {
    if (!workerRef.current) return;
    workerRef.current.terminate();
    workerRef.current = null;
    setProgress(null);
    setNotice(
      "Experiment cancelled. No completed estimate is reported from a partial seed set."
    );
  }
  useEffect(() => {
    if (!active) cancel();
  }, [active]);
  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    []
  );
  function start() {
    if (!request || validationError) return;
    cancel();
    setError("");
    setNotice("");
    setResult(null);
    setProgress(0);
    try {
      const worker = new Worker(
        new URL("../experiments/runner.worker.ts", import.meta.url),
        { type: "module" }
      );
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<BatchMessage>) => {
        if (workerRef.current !== worker) return;
        if (event.data.type === "progress") {
          setProgress(event.data.completed);
          return;
        }
        worker.terminate();
        workerRef.current = null;
        setProgress(null);
        if (event.data.type === "error") setError(event.data.message);
        else {
          setResult(event.data.result);
          setRound(event.data.result.request.horizon);
        }
      };
      worker.onerror = (event) => {
        if (workerRef.current !== worker) return;
        worker.terminate();
        workerRef.current = null;
        setProgress(null);
        setError(
          event.message ||
            "The experiment worker failed. No estimate is reported."
        );
      };
      worker.postMessage(structuredClone(request));
    } catch (cause) {
      workerRef.current?.terminate();
      workerRef.current = null;
      setProgress(null);
      setError(
        cause instanceof Error ? cause.message : "Could not start experiment."
      );
    }
  }
  function download() {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result)], { type: "application/json" })
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "wealth-lab-paired-experiment.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="experiment-view">
      <section className="panel">
        <p className="eyebrow">REPEATED PAIRED EXPERIMENTS</p>
        <h2>Measure an intervention across seeds</h2>
        <p className="hint">
          Each seed produces a control and treatment from round zero. This
          runner uses model v2 common random numbers; it does not alter your
          scenario tabs or reuse their current states.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            start();
          }}
        >
          <fieldset disabled={progress !== null} className="experiment-inputs">
            <legend>Experiment setup</legend>
            <Field
              label="Control"
              help="The reference rules for each seed. The built-in control has wealth-biased investment and no taxes. Choose a scenario to use its applied configuration; pending edits are excluded."
            >
              {(id, desc) => (
                <select
                  id={id}
                  aria-describedby={desc}
                  value={controlId}
                  onChange={(event) => setControlId(event.target.value)}
                >
                  {sourceOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field
              label="Treatment"
              help="The rules compared against control on every seed. Start with a single changed parameter to isolate its effect. The built-in treatment adds 1% wealth tax with universal redistribution."
            >
              {(id, desc) => (
                <select
                  id={id}
                  aria-describedby={desc}
                  value={treatmentId}
                  onChange={(event) => setTreatmentId(event.target.value)}
                >
                  {sourceOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <NumberField
              label="Seed pairs"
              value={runs}
              min={1}
              max={1000}
              step={1}
              onChange={setRuns}
              help="Number of distinct seeds, with both worlds run on every seed. 500 pairs means 1,000 simulations. More pairs describe stochastic variation more reliably; they do not make the economic assumptions more realistic."
            />
            <NumberField
              label="First seed"
              value={firstSeed}
              max={4294967295}
              step={1}
              onChange={setFirstSeed}
              help="The runner uses this seed and the next N−1 integer seeds with no duplicates or wraparound. Each pair uses identical keyed random coordinates."
            />
            <NumberField
              label="Horizon (rounds)"
              value={horizon}
              min={1}
              max={10000}
              step={1}
              onChange={setHorizon}
              help="Both worlds run this many rounds from their equal starting state. Policies apply from the start. Investment returns compound every round without a resource ceiling; long horizons can produce enormous modeled fortunes."
            />
            <Field
              label="Additional checkpoints"
              help="Comma-separated whole rounds to report before the horizon, for example 100, 250, 500. The final horizon is always included. Only checkpoint metrics and final Lorenz shares are retained."
            >
              {(id, desc) => (
                <input
                  id={id}
                  aria-describedby={desc}
                  value={checkpointText}
                  onChange={(event) => setCheckpointText(event.target.value)}
                  placeholder="100, 250, 500"
                />
              )}
            </Field>
          </fieldset>
          <p className="hint">
            Held equal: initial wealth, seed range, random-key scheme and
            horizon. Under wealth-biased access, the same selection draw can
            choose a different person after wealth diverges. Corresponding
            process instances are matched by type and occurrence order.
          </p>
          {request && !validationError && (
            <details className="experiment-differences">
              <summary>
                {changed.length} changed configuration fields{" "}
                <Help label="What is held constant">
                  These differences define the intervention. More than one
                  difference is allowed, but then the effect belongs to the
                  entire bundle. Matching random draws does not imply identical
                  recipients or identical tax revenue.
                </Help>
              </summary>
              <dl className="ledger">
                {changed.map((key) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>
                      {controlEntries[key] ?? "Not configured"} →{" "}
                      {treatmentEntries[key] ?? "Not configured"}
                    </dd>
                  </div>
                ))}
              </dl>
              {!changed.length && (
                <p className="hint">
                  Identical rules should produce exactly zero paired effects.
                </p>
              )}
              <details>
                <summary>Shared rules and starting conditions</summary>
                <dl className="ledger">
                  {Object.keys(controlEntries)
                    .filter(
                      (key) => controlEntries[key] === treatmentEntries[key]
                    )
                    .map((key) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{controlEntries[key]}</dd>
                      </div>
                    ))}
                </dl>
              </details>
            </details>
          )}
          {validationError && (
            <p role="alert" className="error">
              {validationError}
            </p>
          )}
          <div className="experiment-actions">
            <button
              className="primary"
              disabled={!!validationError || progress !== null}
            >
              Run experiment
            </button>
            {progress !== null && (
              <button type="button" onClick={cancel}>
                Cancel experiment
              </button>
            )}
          </div>
        </form>
        {progress !== null && (
          <div role="status">
            <progress
              max={runs}
              value={progress}
              aria-label="Completed seed pairs"
            />{" "}
            {progress} / {runs} seed pairs complete. Leaving Experiments cancels
            the batch.
          </div>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
      </section>
      {result && (
        <>
          <section className="panel experiment-results">
            <div className="panel-heading">
              <h2>Paired treatment effects</h2>
              <button onClick={download}>Download results</button>
            </div>
            <p className="hint">
              Completed: {result.pairs.length} pairs · seeds{" "}
              {result.request.firstSeed}–
              {result.request.firstSeed + result.request.runs - 1} · horizon{" "}
              {result.request.horizon} · model v2 (Philox).
            </p>
            <p className="hint">
              Control: {result.request.controlName}. Treatment:{" "}
              {result.request.treatmentName}. Results belong to the completed
              request, not subsequent setup edits.
            </p>
            <div className="comparison-options">
              <Field
                label="Results checkpoint"
                help="Select a saved round. Every effect compares treatment and control at that same round and seed."
              >
                {(id, desc) => (
                  <select
                    id={id}
                    aria-describedby={desc}
                    value={round}
                    onChange={(event) => setRound(Number(event.target.value))}
                  >
                    {result.request.checkpoints.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field
                label="Effect metric"
                help="Controls the paired-effect trajectory and histogram. Δ always means treatment minus control. Positive values are not automatically better."
              >
                {(id, desc) => (
                  <select
                    id={id}
                    aria-describedby={desc}
                    value={metric}
                    onChange={(event) =>
                      setMetric(event.target.value as keyof Outcomes)
                    }
                  >
                    {outcomes.map((row) => (
                      <option key={row.key} value={row.key}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
            <p className="effect-headline">
              Gini lower in{" "}
              {(
                summarizePairs(result.pairs, round, "gini").lower * 100
              ).toFixed(1)}
              % of paired runs{" "}
              <Help label="Probability of lower Gini">
                The fraction of completed seed pairs where treatment Gini is
                strictly lower than control. Ties are not counted as lower. This
                is an empirical frequency in this model and seed set, not a
                p-value or a probability that a real policy works.
              </Help>
            </p>
            <p className="hint">
              Gini ties:{" "}
              {(
                summarizePairs(result.pairs, round, "gini").equal * 100
              ).toFixed(1)}
              %; higher:{" "}
              {(
                summarizePairs(result.pairs, round, "gini").higher * 100
              ).toFixed(1)}
              %.
            </p>
            <div
              className="table-scroll"
              role="region"
              aria-label="Paired effect results"
              tabIndex={0}
            >
              <table>
                <caption>
                  Round {round}: paired differences across {result.pairs.length}{" "}
                  seeds. 10–90% is an empirical effect range, not a confidence
                  interval.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Outcome</th>
                    <th scope="col">Median control</th>
                    <th scope="col">Median treatment</th>
                    <th scope="col">
                      Median paired Δ{" "}
                      <Help label="Median paired effect">
                        First compute treatment minus control for every seed;
                        then take the median of those differences. This need not
                        equal median(treatment) minus median(control).
                      </Help>
                    </th>
                    <th scope="col">10–90% paired Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {outcomes.map((row) => {
                    const s = summarizePairs(result.pairs, round, row.key);
                    return (
                      <tr key={row.key}>
                        <th scope="row" aria-label={row.label}>
                          {row.label}{" "}
                          <Help label={row.label}>
                            {explanations[row.label] ??
                              "Sum of actual fiscal payments from round 1 through this checkpoint."}
                          </Help>
                        </th>
                        <td>
                          {formatMetric(
                            quantile(
                              result.pairs.map(
                                (pair) =>
                                  pair.checkpoints.find(
                                    (p) => p.round === round
                                  )!.control[row.key]
                              ),
                              0.5
                            ),
                            row.unit
                          )}
                        </td>
                        <td>
                          {formatMetric(
                            quantile(
                              result.pairs.map(
                                (pair) =>
                                  pair.checkpoints.find(
                                    (p) => p.round === round
                                  )!.treatment[row.key]
                              ),
                              0.5
                            ),
                            row.unit
                          )}
                        </td>
                        <td>{formatMetric(s.median, row.unit, true)}</td>
                        <td>
                          {formatMetric(s.p10, row.unit, true)} …{" "}
                          {formatMetric(s.p90, row.unit, true)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          {active && (
            <ExperimentCharts
              result={result}
              metric={metric}
              round={round}
              label={selectedOutcome.label}
              share={selectedOutcome.unit === "share"}
            />
          )}
        </>
      )}
    </div>
  );
}
