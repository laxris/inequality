export interface Participant {
  id: number;
  wealth: number;
}

export interface InvestmentReturns {
  investmentFraction: number;
  successProbability: number;
  successReturn: number;
  failureReturn: number;
}

export type TransferProcess = { type: "fixed-stake-exchange"; stake: number };
export type ExternalProcess =
  | { type: "independent-shocks"; amount: number }
  | ({
      type: "capital-opportunity";
      eventsPerRound: number;
      opportunityAccessExponent: number;
      baselineOpportunityAccess: number;
      capitalMode: "fixed" | "proportional";
      fixedCapital: number;
    } & InvestmentReturns)
  | ({ type: "multiplicative-returns" } & InvestmentReturns);
export type TaxPolicy =
  | {
      type: "income-tax";
      rate: number;
      taxableFlows: "external-gains" | "transfer-gains" | "all-gains";
    }
  | { type: "wealth-tax"; rate: number; exemption: number };

export interface TaxRelief {
  eligibility: "wealthiest" | "fixed";
  fraction: number;
  discount: number;
  affectedTax: "income-tax" | "wealth-tax" | "all";
}

export interface Experiment {
  version: 1 | 2;
  seed: number;
  initialWealth: number;
  wealthFloor: "no-debt";
  transfers: TransferProcess[];
  externalProcesses: ExternalProcess[];
  taxes: TaxPolicy[];
  redistribution:
    | { type: "universal" }
    | { type: "bottom"; fraction: number }
    | { type: "retain" };
  taxRelief?: TaxRelief;
}

export interface ParticipantLedger {
  reliefEligible?: number;
  taxBeforeRelief?: number;
  taxRelief?: number;
  reliefTaxBase?: number;
  reliefTaxesPaid?: number;
  participantId: number;
  transferGains: number;
  transferLosses: number;
  externalGains: number;
  externalLosses: number;
  taxesPaid: number;
  transfersReceived: number;
}
export interface RoundLedger {
  taxBeforeRelief?: number;
  taxRelief?: number;
  participants: ParticipantLedger[];
  totalTransfers: number;
  externalWealthCreated: number;
  externalWealthDestroyed: number;
  taxesCollected: number;
  redistributionPaid: number;
}
export interface Metrics {
  totalWealth: number;
  meanWealth: number;
  medianWealth: number;
  gini: number;
  top1Share: number;
  top10Share: number;
  bottom50Share: number;
  richestWealth: number;
  zeroWealthCount: number;
}
export interface ReportedMetrics extends Metrics {
  treasury: number;
  totalModeledWealth: number;
  top5Share: number;
  taxRelief: number;
}
export interface SimulationState {
  treasury?: number;
  modelVersion?: 2;
  round: number;
  randomState: number;
  participants: Participant[];
  ledger: RoundLedger;
  metrics: Metrics;
}
export type HistoryPoint = ReportedMetrics & { round: number };
export interface RandomSource {
  next(): number;
}
