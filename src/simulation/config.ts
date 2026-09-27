import type { Experiment, InvestmentReturns } from "./types";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a configuration object.");
  return value as Record<string, unknown>;
}
function number(
  value: unknown,
  name: string,
  min: number,
  max: number,
  integer = false
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    throw new Error(
      `${name} must be ${
        integer ? "an integer" : "a number"
      } between ${min} and ${max}.`
    );
  }
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 20)
    throw new Error(
      "Process and policy lists must contain at most 20 entries."
    );
  return value;
}
function returns(value: Record<string, unknown>) {
  number(value.investmentFraction, "Investment fraction", 0, 1);
  number(value.successProbability, "Success probability", 0, 1);
  number(value.successReturn, "Success return", 0, 10);
  number(value.failureReturn, "Failure return", -1, 0);
}
export function validateExperiment(
  value: unknown
): asserts value is Experiment {
  const config = object(value);
  if (
    (config.version !== 1 && config.version !== 2) ||
    config.wealthFloor !== "no-debt"
  )
    throw new Error("Only model versions 1 and 2 with no debt are supported.");
  number(config.seed, "Seed", 0, 4294967295, true);
  number(config.initialWealth, "Initial wealth", 0, 1e9);
  for (const entry of list(config.transfers)) {
    const process = object(entry);
    if (process.type !== "fixed-stake-exchange")
      throw new Error("Unknown transfer process.");
    number(process.stake, "Stake", 0, 1e9);
  }
  for (const entry of list(config.externalProcesses)) {
    const process = object(entry);
    if (process.type === "independent-shocks")
      number(process.amount, "Shock amount", 0, 1e9);
    else if (
      process.type === "capital-opportunity" ||
      process.type === "multiplicative-returns"
    ) {
      returns(process);
      if (process.type === "capital-opportunity") {
        number(process.eventsPerRound, "Events per round", 0, 1000, true);
        number(process.opportunityAccessExponent, "Access exponent", 0, 5);
        number(process.baselineOpportunityAccess, "Baseline access", 0, 1e9);
        number(process.fixedCapital, "Fixed capital", 0, 1e9);
        if (!["fixed", "proportional"].includes(process.capitalMode as string))
          throw new Error("Unknown capital mode.");
      }
    } else throw new Error("Unknown external process.");
  }
  for (const entry of list(config.taxes)) {
    const policy = object(entry);
    number(policy.rate, "Tax rate", 0, 1);
    if (policy.type === "wealth-tax")
      number(policy.exemption, "Wealth exemption", 0, 1e9);
    else if (
      policy.type !== "income-tax" ||
      !["external-gains", "transfer-gains", "all-gains"].includes(
        policy.taxableFlows as string
      )
    )
      throw new Error("Unknown tax policy or income flow.");
  }
  if (config.taxRelief !== undefined) {
    const relief = object(config.taxRelief);
    if (!["wealthiest", "fixed"].includes(relief.eligibility as string))
      throw new Error("Unknown tax relief eligibility.");
    if (
      !["income-tax", "wealth-tax", "all"].includes(relief.affectedTax as string)
    )
      throw new Error("Unknown tax relief base.");
    number(relief.fraction, "Relief eligible fraction", 0.01, 1);
    number(relief.discount, "Tax relief discount", 0, 1);
  }
  const redistribution = object(config.redistribution);
  if (redistribution.type === "bottom") {
    number(redistribution.fraction, "Recipient fraction", 0.01, 1);
  } else if (
    redistribution.type !== "universal" &&
    redistribution.type !== "retain"
  )
    throw new Error("Unknown redistribution policy.");
}

export const expectedReturn = (config: InvestmentReturns) =>
  config.successProbability * config.successReturn +
  (1 - config.successProbability) * config.failureReturn;

export function experimentUrl(experiment: Experiment, baseUrl: string): string {
  validateExperiment(experiment);
  const url = new URL(baseUrl);
  url.searchParams.set("experiment", JSON.stringify(experiment));
  return url.toString();
}

export function validateComposerExperiment(value: unknown): asserts value is Experiment {
  validateExperiment(value);
  if (value.transfers.length > 1 || value.externalProcesses.length > 1 || value.taxes.length > 2 ||
    value.taxes.filter(t => t.type === "income-tax").length > 1 ||
    value.taxes.filter(t => t.type === "wealth-tax").length > 1 ||
    (value.taxes.length === 2 && value.taxes[0].type !== "income-tax"))
    throw new Error("This composer supports one transfer, one external process, and income tax before wealth tax.");
}
