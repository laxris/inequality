import { calculateMobility } from "../simulation/mobility";
import type { Scenario } from "../workspace";
import { Help } from "./Help";

export function Mobility({
  scenario,
  capture,
}: {
  scenario: Scenario;
  capture: () => void;
}) {
  const reference = scenario.mobilityReference;
  const metrics = calculateMobility(
    reference.participants,
    scenario.state.participants
  );
  const percent = (value: number) => `${(100 * value).toFixed(1)}%`;
  const labels = ["Bottom 20%", "Q2", "Q3", "Q4", "Top 20%"];
  return (
    <section className="panel" aria-label="Rank mobility">
      <h2>
        Who moves up or down?{" "}
        <Help label="Rank mobility">
          Compare the same participants at the reference round and current
          round. This measures changes in relative position, not gains in euros.
          Treasury is excluded. Capturing a reference stores one snapshot and
          pauses playback; it does not change simulation rules or randomness.
        </Help>
      </h2>
      <p>
        Reference round {reference.round} → current round {scenario.state.round}
      </p>
      <button onClick={capture}>Use current round as mobility reference</button>
      <p className="hint">
        Run to a round of interest, capture it, then continue the simulation.
        Reset and clones start with a round-zero reference; references stay with
        their scenario until reload.
      </p>
      {metrics.hasTies && (
        <p className="notice">
          Equal-wealth ties are present. Correlation and rank movement use
          average ranks; quintiles break ties by participant ID. At an equal
          start, quintile membership is arbitrary and is not an initial social
          hierarchy.
        </p>
      )}
      <dl className="ledger">
        <div>
          <dt>
            Spearman rank correlation{" "}
            <Help label="Spearman rank correlation">
              Correlation of average wealth ranks: +1 means ranks persist, −1
              means they reverse. Undefined when either distribution is entirely
              equal. This is descriptive, not a statistical significance test.
            </Help>
          </dt>
          <dd>
            {metrics.rankCorrelation === null
              ? "Undefined: an endpoint is entirely equal"
              : metrics.rankCorrelation.toFixed(3)}
          </dd>
        </div>
        <div>
          <dt>
            Mean absolute rank movement{" "}
            <Help label="Mean absolute rank movement">
              Average absolute change in percentile rank, with average ranks for
              ties. Poorest is 0 and richest is 100. From an equal start this
              also reflects the emergence of a hierarchy, not movement from an
              established one.
            </Help>
          </dt>
          <dd>{(100 * metrics.meanRankMovement).toFixed(1)} pp</dd>
        </div>
        <div>
          <dt>
            Bottom-quintile escape{" "}
            <Help label="Bottom-quintile escape">
              Fraction of the 20 people in the reference bottom quintile who are
              outside the bottom quintile now. This is an endpoint comparison,
              not whether someone ever escaped along the way.
            </Help>
          </dt>
          <dd>{percent(metrics.bottomQuintileEscape)}</dd>
        </div>
        <div>
          <dt>
            Top-quintile persistence{" "}
            <Help label="Top-quintile persistence">
              Fraction of the reference top 20 people who are in the top
              quintile now. It does not imply they stayed there in every
              intermediate round.
            </Help>
          </dt>
          <dd>{percent(metrics.topQuintilePersistence)}</dd>
        </div>
      </dl>
      <div
        className="table-scroll"
        role="region"
        aria-label="Quintile transitions"
        tabIndex={0}
      >
        <table>
          <caption>
            Reference → current quintile. Each row contains 20 people and sums
            to 100%.
          </caption>
          <thead>
            <tr>
              <th scope="col">From / to</th>
              {labels.map((label) => (
                <th scope="col" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.transitions.map((row, i) => (
              <tr key={i}>
                <th scope="row">{labels[i]}</th>
                {row.map((value, j) => (
                  <td key={j}>{percent(value)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
