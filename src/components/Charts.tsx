import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";
import type { HistoryPoint, SimulationState } from "../simulation/types";

export function Charts({
  history,
  state,
}: {
  history: HistoryPoint[];
  state: SimulationState;
}) {
  const historyRef = useRef<HTMLDivElement>(null);
  const lorenzRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!historyRef.current || !lorenzRef.current) return;
    const draw = () => {
      const width = Math.max(240, historyRef.current!.clientWidth);
      const series = history.flatMap((point) => [
        { round: point.round, value: point.gini, metric: "Gini" },
        {
          round: point.round,
          value: point.top10Share,
          metric: "Top 10% share",
        },
        {
          round: point.round,
          value: point.bottom50Share,
          metric: "Bottom 50% share",
        },
      ]);
      const plot = Plot.plot({
        width,
        height: 240,
        marginLeft: 45,
        x: { label: "Round", domain: [0, Math.max(1, state.round)] },
        y: { label: "Coefficient / share", domain: [0, 1], grid: true },
        color: {
          domain: ["Gini", "Top 10% share", "Bottom 50% share"],
          range: ["#187863", "#bc674b", "#6273aa"],
          legend: true,
        },
        marks: [
          Plot.lineY(series, {
            x: "round",
            y: "value",
            stroke: "metric",
            z: "metric",
            strokeWidth: 2,
          }),
          Plot.dot(
            series.filter((p) => p.round === state.round),
            { x: "round", y: "value", fill: "metric" },
          ),
        ],
      });
      plot.setAttribute(
        "aria-label",
        "Gini, top 10% share and bottom 50% share over time",
      );
      historyRef.current!.replaceChildren(plot);
      let cumulative = 0;
      const points = [
        { population: 0, wealth: 0 },
        ...[...state.participants]
          .sort((a, b) => a.wealth - b.wealth)
          .map((p, i) => {
            cumulative += state.metrics.totalWealth
              ? p.wealth / state.metrics.totalWealth
              : 0;
            return { population: (i + 1) / 100, wealth: cumulative };
          }),
      ];
      const lorenz = Plot.plot({
        width: Math.max(240, lorenzRef.current!.clientWidth),
        height: 240,
        marginLeft: 45,
        x: { label: "Cumulative population", domain: [0, 1], tickFormat: "%" },
        y: {
          label: "Cumulative wealth",
          domain: [0, 1],
          tickFormat: "%",
          grid: true,
        },
        marks: [
          Plot.line(
            [
              { population: 0, wealth: 0 },
              { population: 1, wealth: 1 },
            ],
            {
              x: "population",
              y: "wealth",
              stroke: "#8d998f",
              strokeDasharray: "4,4",
            },
          ),
          Plot.areaY(points, {
            x: "population",
            y: "wealth",
            fill: "#187863",
            fillOpacity: 0.12,
          }),
          Plot.lineY(points, {
            x: "population",
            y: "wealth",
            stroke: "#187863",
            strokeWidth: 2,
          }),
        ],
      });
      lorenz.setAttribute(
        "aria-label",
        "Lorenz curve: cumulative wealth share from poorest to richest. Dashed line is equality.",
      );
      lorenzRef.current!.replaceChildren(lorenz);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(historyRef.current);
    observer.observe(lorenzRef.current);
    return () => observer.disconnect();
  }, [history, state]);
  return (
    <section className="charts">
      <article className="panel">
        <h2>Inequality over time</h2>
        <p className="hint">Same seed. Same rules. Reproducible trajectory.</p>
        <div ref={historyRef} />
      </article>
      <article className="panel">
        <h2>Lorenz curve</h2>
        <p className="hint">
          Poorest → richest. Dashed line: perfect equality.
          {state.metrics.totalWealth === 0 &&
            " No wealth: shares are defined as zero."}
        </p>
        <div ref={lorenzRef} />
      </article>
    </section>
  );
}
