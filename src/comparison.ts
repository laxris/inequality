import type { Experiment, ReportedMetrics } from "./simulation/types";

export const comparisonMetrics: {
  key: keyof ReportedMetrics;
  label: string;
  unit: "currency" | "share" | "coefficient" | "count";
}[] = [
  { key: "totalWealth", label: "Private wealth", unit: "currency" },
  { key: "treasury", label: "Treasury", unit: "currency" },
  {
    key: "totalModeledWealth",
    label: "Total modeled wealth",
    unit: "currency",
  },
  { key: "taxRelief", label: "Tax relief this round", unit: "currency" },
  { key: "top5Share", label: "Top 5% share", unit: "share" },
  { key: "meanWealth", label: "Mean wealth", unit: "currency" },
  { key: "medianWealth", label: "Median wealth", unit: "currency" },
  { key: "gini", label: "Gini coefficient", unit: "coefficient" },
  { key: "top1Share", label: "Top 1% share", unit: "share" },
  { key: "top10Share", label: "Top 10% share", unit: "share" },
  { key: "bottom50Share", label: "Bottom 50% share", unit: "share" },
  { key: "richestWealth", label: "Richest participant", unit: "currency" },
  { key: "zeroWealthCount", label: "At zero wealth", unit: "count" },
];
const money = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});
const scientificMoney = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  notation: "scientific",
  maximumFractionDigits: 3,
});
export function formatMetric(
  value: number,
  unit: typeof comparisonMetrics[number]["unit"],
  difference = false
): string {
  // Absolute differences avoid a relative-percentage division by a zero baseline.
  const digits = unit === "coefficient" ? 3 : 2;
  const scaled = unit === "share" ? value * 100 : value;
  const rounded = Number(scaled.toFixed(digits));
  const sign = difference && rounded !== 0 ? (rounded > 0 ? "+" : "−") : "";
  const magnitude = difference ? Math.abs(scaled) : scaled;
  return (
    sign +
    (unit === "currency"
      ? (Math.abs(value) >= 1e12 ? scientificMoney : money).format(
          difference ? Math.abs(value) : value
        )
      : unit === "share"
      ? `${magnitude.toFixed(2)}${difference ? " pp" : "%"}`
      : unit === "coefficient"
      ? magnitude.toFixed(3)
      : String(magnitude))
  );
}

// Human-readable paths preserve process order and expose all applied parameters,
// including future fields, without inventing a second configuration schema.
const parameterLabels: Record<string, string> = {
  taxRelief: "Tax relief",
  eligibility: "Eligibility",
  affectedTax: "Affected tax",
  discount: "Liability discount",
  version: "Model version",
  seed: "Seed",
  initialWealth: "Initial wealth per participant (€)",
  wealthFloor: "Wealth floor",
  transfers: "Transfers",
  externalProcesses: "External processes",
  taxes: "Taxes",
  redistribution: "Redistribution",
  type: "Type",
  stake: "Stake (€)",
  amount: "Shock amount (€)",
  eventsPerRound: "Events per round",
  opportunityAccessExponent: "Access exponent α",
  baselineOpportunityAccess: "Baseline access (€)",
  capitalMode: "Capital mode",
  fixedCapital: "Fixed capital (€)",
  investmentFraction: "Investment fraction",
  successProbability: "Success probability",
  successReturn: "Success return",
  failureReturn: "Failure return",
  rate: "Tax rate per round",
  exemption: "Exemption (€)",
  taxableFlows: "Taxable gains",
  fraction: "Recipient fraction",
};
export function configurationEntries(
  config: Experiment
): Record<string, string> {
  const entries: Record<string, string> = {};
  const visit = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      if (!value.length) entries[path] = "None";
      value.forEach((entry, i) => visit(entry, `${path} ${i + 1}`));
    } else if (value !== null && typeof value === "object") {
      Object.entries(value).forEach(([key, entry]) =>
        visit(
          entry,
          [path, parameterLabels[key] ?? key].filter(Boolean).join(" / ")
        )
      );
    } else
      entries[path] =
        typeof value === "string" ? value.replaceAll("-", " ") : String(value);
  };
  visit(config, "");
  return entries;
}
