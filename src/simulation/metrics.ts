import type {
  Metrics,
  Participant,
  ReportedMetrics,
  SimulationState,
} from "./types";

export function calculateMetrics(participants: Participant[]): Metrics {
  if (
    !participants.length ||
    participants.some((p) => !Number.isFinite(p.wealth) || p.wealth < 0)
  ) {
    throw new Error(
      "Metrics require a nonempty, finite, nonnegative distribution."
    );
  }
  const sorted = participants.map((p) => p.wealth).sort((a, b) => a - b);
  const count = sorted.length;
  const totalWealth = sorted.reduce((sum, wealth) => sum + wealth, 0);
  if (!Number.isFinite(totalWealth))
    throw new Error(
      "Aggregate wealth overflowed; reset with smaller parameters."
    );
  const shares = sorted.map((wealth) =>
    totalWealth === 0 ? 0 : wealth / totalWealth
  );
  const share = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0);
  const gini =
    totalWealth === 0
      ? 0
      : shares.reduce((sum, value, i) => sum + (2 * i + 1 - count) * value, 0) /
        count;
  return {
    totalWealth,
    meanWealth: totalWealth / count,
    medianWealth:
      sorted[Math.floor((count - 1) / 2)] / 2 +
      sorted[Math.floor(count / 2)] / 2,
    gini: Math.max(0, Math.min(1 - 1 / count, gini)),
    top1Share: share(shares.slice(-Math.ceil(count * 0.01))),
    top10Share: share(shares.slice(-Math.ceil(count * 0.1))),
    bottom50Share: share(shares.slice(0, Math.ceil(count * 0.5))),
    richestWealth: sorted[count - 1],
    zeroWealthCount: sorted.filter((w) => w === 0).length,
  };
}

// Reporting additions stay outside the versioned economic-state snapshots.
export function reportedMetrics(state: SimulationState): ReportedMetrics {
  const treasury = state.treasury ?? 0;
  return {
    ...state.metrics,
    treasury,
    totalModeledWealth: state.metrics.totalWealth + treasury,
    top5Share: [...state.participants]
      .sort((a, b) => b.wealth - a.wealth)
      .slice(0, 5)
      .reduce(
        (share, p) =>
          share +
          (state.metrics.totalWealth
            ? p.wealth / state.metrics.totalWealth
            : 0),
        0
      ),
    taxRelief: state.ledger.taxRelief ?? 0,
  };
}

export function reliefIncidence(state: SimulationState, eligible: boolean) {
  const members = state.ledger.participants.filter(
    (p) => Boolean(p.reliefEligible) === eligible
  );
  // Normalize the denominator so adding income and stock bases cannot overflow.
  const scale = Math.max(0, ...members.map((p) => p.reliefTaxBase ?? 0));
  const normalizedBase =
    scale === 0
      ? 0
      : members.reduce((sum, p) => sum + (p.reliefTaxBase ?? 0) / scale, 0);
  const paid = members.reduce((sum, p) => sum + (p.reliefTaxesPaid ?? 0), 0);
  return { effectiveRate: scale === 0 ? null : paid / scale / normalizedBase };
}
