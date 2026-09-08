import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";
import {
  quantile,
  summarizePairs,
  type BatchResult,
  type Outcomes,
} from "../experiments/runner";
import { Help } from "./Help";

export function ExperimentCharts({
  result,
  metric,
  round,
  label,
  share,
}: {
  result: BatchResult;
  metric: keyof Outcomes;
  round: number;
  label: string;
  share: boolean;
}) {
  const trajectoryRef = useRef<HTMLDivElement>(null);
  const histogramRef = useRef<HTMLDivElement>(null);
  const lorenzRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const hosts = [
      trajectoryRef.current,
      histogramRef.current,
      lorenzRef.current,
    ];
    if (hosts.some((host) => !host)) return;
    const scale = share ? 100 : 1;
    const trajectory = result.request.checkpoints.map((t) => {
      const s = summarizePairs(result.pairs, t, metric);
      return {
        round: t,
        median: s.median * scale,
        p10: s.p10 * scale,
        p90: s.p90 * scale,
      };
    });
    const values = result.pairs.map((pair) => ({
      delta:
        pair.checkpoints.find((p) => p.round === round)!.delta[metric] * scale,
    }));
    const lorenz = Array.from({ length: 101 }, (_, index) => [
      {
        population: index / 100,
        share: quantile(
          result.pairs.map((p) => p.controlLorenz[index]),
          0.5
        ),
        series: "Control",
      },
      {
        population: index / 100,
        share: quantile(
          result.pairs.map((p) => p.treatmentLorenz[index]),
          0.5
        ),
        series: "Treatment",
      },
    ]).flat();
    const draw = () => {
      const yLabel = `Δ ${label}${share ? " (pp)" : ""}`;
      const trajectoryPlot = Plot.plot({
        width: Math.max(240, trajectoryRef.current!.clientWidth),
        height: 270,
        marginLeft: 65,
        x: {
          label: "Checkpoint round",
          domain: [0, result.request.horizon],
          tickFormat: "d",
        },
        y: { label: yLabel, zero: true, grid: true },
        marks: [
          Plot.ruleY([0], { stroke: "#8d998f" }),
          Plot.areaY(trajectory, {
            x: "round",
            y1: "p10",
            y2: "p90",
            fill: "#187863",
            fillOpacity: 0.18,
          }),
          Plot.lineY(trajectory, {
            x: "round",
            y: "median",
            stroke: "#187863",
          }),
          Plot.dot(trajectory, {
            x: "round",
            y: "median",
            fill: "#187863",
            tip: true,
          }),
        ],
      });
      trajectoryPlot.setAttribute(
        "aria-label",
        `${label}: median paired treatment effects and empirical 10th–90th percentile range at saved checkpoints`
      );
      trajectoryRef.current!.replaceChildren(trajectoryPlot);
      const histogram = Plot.plot({
        width: Math.max(240, histogramRef.current!.clientWidth),
        height: 270,
        marginLeft: 65,
        x: { label: yLabel },
        y: { label: "Seed pairs", grid: true },
        marks: [
          Plot.rectY(values, {
            ...Plot.binX({ y: "count" }, { x: "delta", thresholds: 20 }),
            fill: "#187863",
            tip: true,
          }),
          Plot.ruleY([0], { stroke: "#8d998f" }),
        ],
      });
      histogram.setAttribute(
        "aria-label",
        `Distribution of paired ${label} effects at round ${round}`
      );
      histogramRef.current!.replaceChildren(histogram);
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
        color: {
          domain: ["Control", "Treatment"],
          range: ["#6273aa", "#187863"],
          legend: true,
        },
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
            stroke: "series",
            z: "series",
          }),
        ],
      });
      lorenzPlot.setAttribute(
        "aria-label",
        "Pointwise median final Lorenz curves across seed pairs"
      );
      lorenzRef.current!.replaceChildren(lorenzPlot);
    };
    draw();
    const observer = new ResizeObserver(draw);
    hosts.forEach((host) => observer.observe(host!));
    return () => observer.disconnect();
  }, [result, metric, round, label, share]);
  return (
    <div className="charts">
      <article className="panel">
        <h2>
          Paired effect over time{" "}
          <Help label="Empirical effect band">
            The line is the median of treatment-minus-control outcomes at each
            checkpoint. The band contains the central 80% of observed seed
            effects. It is not a confidence interval for a population mean.
            Lines between checkpoints are visual interpolation.
          </Help>
        </h2>
        <div ref={trajectoryRef} />
      </article>
      <article className="panel">
        <h2>Distribution of paired effects</h2>
        <p className="hint">
          Round {round}. One observation per seed pair; zero means no
          difference. The horizontal axis follows the observed range.
        </p>
        <div ref={histogramRef} />
      </article>
      <article className="panel">
        <h2>
          Final Lorenz curves{" "}
          <Help label="Median Lorenz curves">
            At each population percentile, take the median cumulative wealth
            share across seeds. This summarizes distributions at the final
            horizon; it is not the trajectory of a representative individual
            seed. Zero-wealth economies contribute zero shares.
          </Help>
        </h2>
        <p className="hint">
          Pointwise medians at round {result.request.horizon}, irrespective of
          the selected results checkpoint.
        </p>
        <div ref={lorenzRef} />
      </article>
    </div>
  );
}
