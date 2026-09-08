import type { Experiment, ExternalProcess } from "./types";

export const opportunity: Extract<
  ExternalProcess,
  { type: "capital-opportunity" }
> = {
  type: "capital-opportunity",
  eventsPerRound: 10,
  opportunityAccessExponent: 1,
  baselineOpportunityAccess: 100,
  capitalMode: "proportional",
  fixedCapital: 100,
  investmentFraction: 0.1,
  successProbability: 0.65,
  successReturn: 0.4,
  failureReturn: -0.25,
};
const base: Experiment = {
  version: 1,
  seed: 42,
  initialWealth: 1000,
  wealthFloor: "no-debt",
  transfers: [],
  externalProcesses: [],
  taxes: [],
  redistribution: { type: "universal" },
};
export const presets: {
  name: string;
  description: string;
  experiment: Experiment;
}[] = [
  {
    name: "Fair fixed-stake exchange",
    description:
      "Random pairs exchange up to €50 each round. A fair coin chooses the payer. Total wealth is conserved.",
    experiment: {
      ...base,
      transfers: [{ type: "fixed-stake-exchange", stake: 50 }],
    },
  },
  {
    name: "Independent external shocks",
    description:
      "Each participant independently gains or loses €50. Losses stop at zero, so total wealth can change and the floor creates an upward bias.",
    experiment: {
      ...base,
      externalProcesses: [{ type: "independent-shocks", amount: 50 }],
    },
  },
  {
    name: "Equal-access investment",
    description:
      "Ten opportunities per round, with equal access. Each selected participant invests 10% of current wealth.",
    experiment: {
      ...base,
      externalProcesses: [{ ...opportunity, opportunityAccessExponent: 0 }],
    },
  },
  {
    name: "Wealth-biased fixed opportunity",
    description:
      "Access is proportional to wealth plus €100. Capital is fixed at €100, limited by available wealth.",
    experiment: {
      ...base,
      externalProcesses: [{ ...opportunity, capitalMode: "fixed" }],
    },
  },
  {
    name: "Wealth-biased scalable investment",
    description:
      "Access is proportional to wealth plus €100. Deployed capital is 10% of the selected participant’s wealth.",
    experiment: { ...base, externalProcesses: [opportunity] },
  },
  {
    name: "Investment + income redistribution",
    description:
      "Wealth-biased scalable investment, then 20% tax on gross external gains, redistributed equally to everyone.",
    experiment: {
      ...base,
      externalProcesses: [opportunity],
      taxes: [
        { type: "income-tax", rate: 0.2, taxableFlows: "external-gains" },
      ],
    },
  },
  {
    name: "Investment + wealth redistribution",
    description:
      "Wealth-biased scalable investment, then a 1% wealth tax per round, redistributed to the poorest 20%.",
    experiment: {
      ...base,
      externalProcesses: [opportunity],
      taxes: [{ type: "wealth-tax", rate: 0.01, exemption: 0 }],
      redistribution: { type: "bottom", fraction: 0.2 },
    },
  },
  {
    name: "Universal multiplicative returns",
    description:
      "Everyone invests 10% of current wealth each round, with independent returns. Access is universal; payoff scales with wealth.",
    experiment: {
      ...base,
      externalProcesses: [{ ...opportunity, type: "multiplicative-returns" }],
    },
  },
];
