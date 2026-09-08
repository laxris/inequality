import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";
import { comparisonMetrics } from "../comparison";
import { scenarioName, type Scenario } from "../workspace";
import type { ReportedMetrics } from "../simulation/types";

export function ComparisonCharts({
  scenarios,
  metric,
}: {
  scenarios: Scenario[];
  metric: keyof ReportedMetrics;
}) {
  const historyRef = useRef<HTMLDivElement>(null);
  const lorenzRef = useRef<HTMLDivElement>(null);
  const distributionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const hosts = [
      historyRef.current,
      lorenzRef.current,
      distributionRef.current,
    ];
    if (hosts.some((host) => !host) || !scenarios.length) return;
    const labels = scenarios.map((s) => `#${s.id} ${scenarioName(s)}`);
    const currentLabels = scenarios.map(
      (s, i) => `${labels[i]} · round ${s.state.round}`
    );
    const selectedMetric = comparisonMetrics.find((row) => row.key === metric)!;
    const history = scenarios.flatMap((scenario, i) =>
      scenario.history.map((point) => ({
        round: point.round,
        value: point[metric],
        scenario: labels[i],
        last: point.round === scenario.state.round,
      }))
    );
    const lorenz: { population: number; share: number; scenario: string }[] =
      [];
    const distribution: {
      percentile: number;
      wealth: number;
      scenario: string;
    }[] = [];
    scenarios.forEach((scenario, index) => {
      let cumulative = 0;
      lorenz.push({ population: 0, share: 0, scenario: currentLabels[index] });
      [...scenario.state.participants]
        .sort((a, b) => a.wealth - b.wealth)
        .forEach((participant, i, sorted) => {
          cumulative += scenario.state.metrics.totalWealth
            ? participant.wealth / scenario.state.metrics.totalWealth
            : 0;
          lorenz.push({
            population: (i + 1) / sorted.length,
            share: cumulative,
            scenario: currentLabels[index],
          });
          distribution.push({
            percentile: (i + 1) / sorted.length,
            wealth: participant.wealth,
            scenario: currentLabels[index],
          });
        });
    });
    const draw = () => {
      const historyPlot = Plot.plot({
        width: Math.max(240, historyRef.current!.clientWidth),
        height: 270,
        marginLeft: 65,
        x: {
          label: "Round",
          domain: [0, Math.max(1, ...scenarios.map((s) => s.state.round))],
          tickFormat: "d",
        },
        y: {
          label: selectedMetric.label,
          grid: true,
          ...(selectedMetric.unit === "share" ||
          selectedMetric.unit === "coefficient"
            ? { domain: [0, 1] }
            : { zero: true }),
          ...(selectedMetric.unit === "share" ? { tickFormat: "%" } : {}),
        },
        color: { domain: labels, scheme: "tableau10", legend: true },
        marks: [
          Plot.lineY(history, {
            x: "round",
            y: "value",
            stroke: "scenario",
            z: "scenario",
            strokeWidth: 2,
            tip: true,
          }),
          Plot.dot(
            history.filter((point) => point.last),
            { x: "round", y: "value", fill: "scenario" }
          ),
        ],
      });
      historyPlot.setAttribute(
        "aria-label",
        `${selectedMetric.label} over time by scenario; each line ends at its last completed round`
      );
      historyRef.current!.replaceChildren(historyPlot);
      const lorenzPlot = Plot.plot({
        width: Math.max(240, lorenzRef.current!.clientWidth),
        height: 270,
        marginLeft: 65,
        x: { label: "Cumulative population", domain: [0, 1], tickFormat: "%" },
        y: {
          label: "Cumulative wealth",
          domain: [0, 1],
          tickFormat: "%",
          grid: true,
        },
        color: { domain: currentLabels, scheme: "tableau10", legend: true },
        marks: [
          Plot.line(
            [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
            { x: "x", y: "y", stroke: "#8d998f", strokeDasharray: "4,4" }
          ),
          Plot.lineY(lorenz, {
            x: "population",
            y: "share",
            stroke: "scenario",
            z: "scenario",
            strokeWidth: 2,
            tip: true,
          }),
        ],
      });
      lorenzPlot.setAttribute(
        "aria-label",
        "Current Lorenz curves by scenario; dashed line is equality"
      );
      lorenzRef.current!.replaceChildren(lorenzPlot);
      const distributionPlot = Plot.plot({
        width: Math.max(240, distributionRef.current!.clientWidth),
        height: 270,
        marginLeft: 65,
        x: {
          label: "Wealth percentile (poorest → richest)",
          domain: [0, 1],
          tickFormat: "%",
        },
        y: {
          label: "Participant wealth (€)",
          domain: [
            0,
            Math.max(1, ...scenarios.map((s) => s.state.metrics.richestWealth)),
          ],
          grid: true,
        },
        color: { domain: currentLabels, scheme: "tableau10", legend: true },
        marks: [
          Plot.lineY(distribution, {
            x: "percentile",
            y: "wealth",
            stroke: "scenario",
            z: "scenario",
            strokeWidth: 2,
            tip: true,
          }),
        ],
      });
      distributionPlot.setAttribute(
        "aria-label",
        "Current participant wealth by percentile and scenario, using a common linear euro scale"
      );
      distributionRef.current!.replaceChildren(distributionPlot);
    };
    draw();
    const observer = new ResizeObserver(draw);
    hosts.forEach((host) => observer.observe(host!));
    return () => observer.disconnect();
  }, [scenarios, metric]);
  return (
    <section className="charts comparison-charts">
      <article className="panel">
        <h2>History by scenario</h2>
        <p className="hint">
          All completed rounds. Endpoints mark where each scenario is paused; no
          extrapolation.
        </p>
        <div ref={historyRef} />
      </article>
      <article className="panel">
        <h2>Current Lorenz curves</h2>
        <p className="hint">
          Each scenario’s current round. Dashed line: equality. Zero total
          wealth gives zero shares.
        </p>
        <div ref={lorenzRef} />
      </article>
      <article className="panel">
        <h2>Current wealth distribution</h2>
        <p className="hint">
          100 participants per scenario, sorted for this chart only. Shared
          linear scale in euros.
        </p>
        <div ref={distributionRef} />
      </article>
    </section>
  );
}
