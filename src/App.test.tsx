// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import App from "./App";
import { wealthRadius } from "./components/WealthGrid";
import { presets } from "./simulation/presets";

// Chart rendering is verified in a real browser; keep these tests about controls.
vi.mock("./components/Charts", () => ({ Charts: () => <div /> }));
vi.mock("./components/ComparisonCharts", () => ({
  ComparisonCharts: () => <div />,
}));
beforeEach(() => window.history.replaceState(null, "", "/"));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("experiment controls", () => {
  it("steps one round, resets, and reproduces the same participant outcome", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Step" }));
    expect(screen.getByTestId("round").textContent).toBe("1");
    const first = screen
      .getByRole("button", { name: /^Participant 1,/ })
      .getAttribute("aria-label");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByTestId("round").textContent).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Step" }));
    expect(
      screen
        .getByRole("button", { name: /^Participant 1,/ })
        .getAttribute("aria-label")
    ).toBe(first);
  });
  it("runs in deterministic batches and stops on pause", () => {
    vi.useFakeTimers();
    render(<App />);
    fireEvent.change(screen.getByLabelText("Speed"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByTestId("round").textContent).toBe("5");
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("round").textContent).toBe("5");
    const outcome = screen
      .getByRole("button", { name: /^Participant 1,/ })
      .getAttribute("aria-label");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    for (let i = 0; i < 5; i++)
      fireEvent.click(screen.getByRole("button", { name: "Step" }));
    expect(
      screen
        .getByRole("button", { name: /^Participant 1,/ })
        .getAttribute("aria-label")
    ).toBe(outcome);
  });
  it("validates edits and applies the chosen configuration to a new run", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Random seed"), {
      target: { value: "-1" },
    });
    expect(screen.getByRole("alert").textContent).toContain("Seed");
    expect(
      (
        screen.getByRole("button", {
          name: "Apply & reset",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Random seed"), {
      target: { value: "123" },
    });
    fireEvent.change(screen.getByLabelText("Wealth per participant (€)"), {
      target: { value: "2000" },
    });
    expect(
      (screen.getByRole("button", { name: "Step" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Apply & reset" }));
    expect(
      screen
        .getByRole("button", { name: /^Participant 1,/ })
        .getAttribute("aria-label")
    ).toContain("2,000");
    fireEvent.change(screen.getByLabelText("Start with a preset"), {
      target: { value: "1" },
    });
    expect((screen.getByLabelText("Process") as HTMLSelectElement).value).toBe(
      "independent-shocks"
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply & reset" }));
    fireEvent.click(screen.getByRole("button", { name: "Step" }));
    expect(screen.getByTestId("round").textContent).toBe("1");
  });
  it("applies transfer-only income tax selected in the composer", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Process"), {
      target: { value: "independent-shocks" },
    });
    fireEvent.click(screen.getByLabelText("Income tax"));
    fireEvent.change(screen.getByLabelText("Taxable gross gains"), {
      target: { value: "transfer-gains" },
    });
    expect(
      (screen.getByLabelText("Taxable gross gains") as HTMLSelectElement).value
    ).toBe("transfer-gains");
    fireEvent.click(screen.getByRole("button", { name: "Apply & reset" }));
    fireEvent.click(screen.getByRole("button", { name: "Step" }));
    expect(screen.getByText("€500.00 / €500.00")).toBeTruthy();
  });

  it("loads shared settings and reports an invalid shared configuration", () => {
    const url = new URL(window.location.href);
    url.searchParams.set(
      "experiment",
      JSON.stringify({ ...presets[0].experiment, initialWealth: 25, seed: 8 })
    );
    window.history.replaceState(null, "", url);
    const view = render(<App />);
    expect(
      (screen.getByLabelText("Random seed") as HTMLInputElement).value
    ).toBe("8");
    expect(
      screen
        .getByRole("button", { name: /^Participant 1,/ })
        .getAttribute("aria-label")
    ).toContain("€25.00");
    view.unmount();
    window.history.replaceState(null, "", "/?experiment=broken");
    render(<App />);
    expect(screen.getByRole("status").textContent).toContain(
      "Could not load shared experiment"
    );
  });
  it("makes zero-wealth participants keyboard-inspectable and sizes circle area proportionally", () => {
    render(<App />);
    const participant = screen.getByRole("button", {
      name: /^Participant 22,/,
    });
    fireEvent.focus(participant);
    expect(
      screen.getByRole("heading", { name: "Participant 22" })
    ).toBeTruthy();
    expect(wealthRadius(4, 100) ** 2 / wealthRadius(1, 100) ** 2).toBe(4);
    expect(wealthRadius(0, 0)).toBe(0);
    expect(wealthRadius(100, 100)).toBeGreaterThan(25);
  });
});

describe("scenario workspace", () => {
  it("pauses inactive tabs, preserves runs, and uses keyboard tab navigation", () => {
    vi.useFakeTimers();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByTestId("round").textContent).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Clone scenario" }));
    expect(screen.getByTestId("round").textContent).toBe("0");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(screen.getByRole("tab", { name: "Scenario 1" }));
    expect(screen.getByTestId("round").textContent).toBe("1");
    expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Scenario 1" }), {
      key: "End",
    });
    const comparison = screen.getByRole("tab", { name: "Comparison" });
    expect(comparison.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(comparison);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.keyDown(comparison, { key: "Home" });
    expect(screen.getByTestId("round").textContent).toBe("1");
  });

  it("compares cloned bottom-20% and bottom-50% experiments at matching rounds", () => {
    vi.useFakeTimers();
    render(<App />);
    fireEvent.change(screen.getByLabelText("Start with a preset"), {
      target: { value: "6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply & reset" }));
    fireEvent.change(screen.getByLabelText("Scenario name"), {
      target: { value: "Bottom 20%" },
    });
    fireEvent.change(screen.getByLabelText("Speed"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run to target" }));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByTestId("round").textContent).toBe("100");
    fireEvent.click(screen.getByRole("button", { name: "Clone scenario" }));
    fireEvent.change(screen.getByLabelText("Scenario name"), {
      target: { value: "Bottom 50%" },
    });
    fireEvent.change(screen.getByLabelText("Recipient fraction (0.01–1)"), {
      target: { value: "0.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply & reset" }));
    fireEvent.click(screen.getByRole("tab", { name: "Comparison" }));
    expect(screen.getByRole("status").textContent).toContain(
      "Different current rounds"
    );
    fireEvent.change(screen.getByLabelText("Table rounds"), {
      target: { value: "historical" },
    });
    expect(
      screen.getByRole("table", { name: "Outcomes at round 0" })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Bottom 50%" }));
    fireEvent.click(screen.getByRole("button", { name: "Run to target" }));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.click(screen.getByRole("tab", { name: "Comparison" }));
    fireEvent.change(screen.getByLabelText("Table rounds"), {
      target: { value: "current" },
    });
    expect(screen.queryByRole("status")).toBeNull();
    const parameters = screen.getByRole("table", {
      name: "Parameters that differ between selected scenarios",
    });
    expect(
      within(parameters).getByText("Redistribution / Recipient fraction")
    ).toBeTruthy();
    expect(within(parameters).getByText("0.2")).toBeTruthy();
    expect(within(parameters).getByText("0.5")).toBeTruthy();
    const outcomes = screen.getByRole("table", {
      name: "Outcomes at each scenario’s current round",
    });
    const giniRow = within(outcomes)
      .getByRole("rowheader", { name: "Gini coefficient" })
      .closest("tr")!;
    const forward = within(giniRow).getByText(/^Δ/).textContent;
    expect(forward).not.toBe("Δ 0.000");
    fireEvent.change(screen.getByLabelText("Reference scenario"), {
      target: { value: "2" },
    });
    const backward = within(giniRow).getByText(/^Δ/).textContent;
    expect(backward).not.toBe(forward);
    fireEvent.click(screen.getByRole("tab", { name: "Bottom 50%" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete scenario" }));
    expect(screen.getByTestId("round").textContent).toBe("100");
    fireEvent.click(screen.getByRole("tab", { name: "Comparison" }));
    expect(screen.queryByRole("checkbox", { name: /Bottom 50%/ })).toBeNull();
  });

  it("deletes a running scenario, handles zero selections, and creates a new scenario after deleting all", () => {
    vi.useFakeTimers();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete scenario" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText(/No scenarios yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New scenario" }));
    expect(screen.getByTestId("round").textContent).toBe("0");
    expect(screen.getByRole("tab", { name: "Scenario 2" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Comparison" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Scenario 2/ }));
    expect(
      screen.getByText("Select at least one scenario to compare.")
    ).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("pauses scenario playback in Experiments and preserves its state on return", () => {
    vi.useFakeTimers();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Step" }));
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    fireEvent.click(screen.getByRole("button", { name: "Experiments" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Scenarios" }));
    expect(screen.getByTestId("round").textContent).toBe("1");
    expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
  });
  it("applies Treasury retention and relief to a clone and compares historical fiscal values", () => {
    render(<App />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Fixed-stake fair exchange" })
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Wealth tax" }));
    fireEvent.change(screen.getByLabelText("Redistribute collected taxes to"), {
      target: { value: "retain" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply & reset" }));
    fireEvent.click(screen.getByRole("button", { name: "Step" }));
    fireEvent.click(screen.getByRole("button", { name: "Clone scenario" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Tax relief / loophole" })
    );
    expect(
      (screen.getByLabelText("Eligible fraction (0.01–1)") as HTMLInputElement)
        .value
    ).toBe("0.05");
    fireEvent.change(screen.getByLabelText("Relief eligibility"), {
      target: { value: "fixed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply & reset" }));
    fireEvent.click(screen.getByRole("button", { name: "Step" }));
    fireEvent.click(screen.getByRole("tab", { name: "Comparison" }));
    const row = screen
      .getByRole("rowheader", { name: "Treasury" })
      .closest("tr")!;
    expect(row.textContent).toContain("€1,000.00");
    expect(row.textContent).toContain("€960.00");
    expect(row.textContent).toContain("−€40.00");
    fireEvent.change(screen.getByLabelText("Table rounds"), {
      target: { value: "historical" },
    });
    fireEvent.change(screen.getByLabelText("Comparison round"), {
      target: { value: "0" },
    });
    expect(row.textContent).not.toContain("€960.00");
    expect(row.textContent).toContain("€0.00");
  });
});
