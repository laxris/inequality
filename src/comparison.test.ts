import { expect, it } from "vitest";
import { configurationEntries, formatMetric } from "./comparison";
import { presets } from "./simulation/presets";

it("formats signed absolute differences without relative division or false signs at display precision", () => {
  expect(formatMetric(0.05, "share", true)).toBe("+5.00 pp");
  expect(formatMetric(-0.1, "share", true)).toBe("−10.00 pp");
  expect(formatMetric(0.012, "coefficient", true)).toBe("+0.012");
  expect(formatMetric(20, "currency", true)).toBe("+€20.00");
  expect(formatMetric(0, "currency", true)).toBe("€0.00");
  expect(formatMetric(-1.25e30, "currency", true)).toBe("−€1.25E30");
  expect(formatMetric(-0.00001, "coefficient", true)).toBe("0.000");
  expect(formatMetric(0, "share", true)).toBe("0.00 pp");
});

it("exposes changed parameters and preserves signs and configuration order", () => {
  const config = structuredClone(presets[6].experiment);
  const original = configurationEntries(config);
  expect(original["External processes 1 / Failure return"]).toBe("-0.25");
  expect(original["Redistribution / Recipient fraction"]).toBe("0.2");
  expect(original["Taxes 1 / Type"]).toBe("wealth tax");
  config.redistribution = { type: "bottom", fraction: 0.5 };
  const changed = configurationEntries(config);
  expect(
    Object.keys(original).filter((key) => original[key] !== changed[key])
  ).toEqual(["Redistribution / Recipient fraction"]);
});
