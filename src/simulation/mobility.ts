import type { Participant } from "./types";

/** Compare fixed identities; ranks ascend from poorest to richest. */
export function calculateMobility(
  reference: Participant[],
  current: Participant[]
) {
  function ranks(participants: Participant[]) {
    if (
      participants.length !== 100 ||
      new Set(participants.map((p) => p.id)).size !== 100 ||
      participants.some(
        (p) =>
          !Number.isInteger(p.id) ||
          p.id < 0 ||
          p.id >= 100 ||
          !Number.isFinite(p.wealth) ||
          p.wealth < 0
      )
    )
      throw new Error(
        "Mobility requires 100 finite nonnegative participants with unique IDs 0–99."
      );
    const sorted = [...participants].sort(
      (a, b) => a.wealth - b.wealth || a.id - b.id
    );
    const midrank = new Array<number>(100);
    const quintile = new Array<number>(100);
    let ties = false;
    for (let first = 0; first < 100; ) {
      let end = first + 1;
      while (end < 100 && sorted[end].wealth === sorted[first].wealth) end++;
      ties ||= end - first > 1;
      for (let i = first; i < end; i++) {
        midrank[sorted[i].id] = (first + end - 1) / 2;
        // Quintiles require 20 members; ID breaks ties without changing primary order.
        quintile[sorted[i].id] = Math.floor(i / 20);
      }
      first = end;
    }
    return { midrank, quintile, ties };
  }
  const start = ranks(reference),
    end = ranks(current);
  const transitions = Array.from({ length: 5 }, () => Array<number>(5).fill(0));
  let covariance = 0,
    startVariance = 0,
    endVariance = 0,
    movement = 0;
  for (let id = 0; id < 100; id++) {
    const x = start.midrank[id] - 49.5,
      y = end.midrank[id] - 49.5;
    covariance += x * y;
    startVariance += x * x;
    endVariance += y * y;
    movement += Math.abs(end.midrank[id] - start.midrank[id]) / 99;
    transitions[start.quintile[id]][end.quintile[id]]++;
  }
  return {
    rankCorrelation:
      startVariance === 0 || endVariance === 0
        ? null
        : Math.max(
            -1,
            Math.min(
              1,
              covariance / Math.sqrt(startVariance) / Math.sqrt(endVariance)
            )
          ),
    meanRankMovement: movement / 100,
    bottomQuintileEscape: 1 - transitions[0][0] / 20,
    topQuintilePersistence: transitions[4][4] / 20,
    transitions: transitions.map((row) => row.map((count) => count / 20)),
    hasTies: start.ties || end.ties,
  };
}
