// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { Experiments } from "./Experiments";
import {
  runPair,
  type BatchMessage,
  type BatchRequest,
} from "../experiments/runner";
vi.mock("./ExperimentCharts", () => ({ ExperimentCharts: () => <div /> }));
class TestWorker {
  static latest: TestWorker;
  request!: BatchRequest;
  terminated = false;
  onmessage: ((event: MessageEvent<BatchMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  constructor() {
    TestWorker.latest = this;
  }
  postMessage(request: BatchRequest) {
    this.request = request;
  }
  terminate() {
    this.terminated = true;
  }
  emit(message: BatchMessage) {
    this.onmessage?.({ data: message } as MessageEvent<BatchMessage>);
  }
}
beforeEach(() => vi.stubGlobal("Worker", TestWorker));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup() {
  fireEvent.change(screen.getByLabelText("Seed pairs"), {
    target: { value: "2" },
  });
  fireEvent.change(screen.getByLabelText("Horizon (rounds)"), {
    target: { value: "5" },
  });
  fireEvent.change(screen.getByLabelText("Additional checkpoints"), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Run experiment" }));
  return TestWorker.latest;
}
it("reports the completed paired request and retains its provenance when inputs change", () => {
  render(<Experiments scenarios={[]} active />);
  const worker = setup();
  expect(worker.request.control.version).toBe(2);
  expect(worker.request.checkpoints).toEqual([5]);
  act(() => worker.emit({ type: "progress", completed: 1, total: 2 }));
  expect(screen.getByRole("status").textContent).toContain("1 / 2");
  act(() =>
    worker.emit({
      type: "done",
      result: {
        request: worker.request,
        pairs: [42, 43].map((seed) => runPair(worker.request, seed)),
      },
    })
  );
  expect(worker.terminated).toBe(true);
  expect(screen.getByRole("table")).toBeTruthy();
  expect(screen.getByText(/Completed: 2 pairs/).textContent).toContain(
    "horizon 5"
  );
  fireEvent.change(screen.getByLabelText("Seed pairs"), {
    target: { value: "100" },
  });
  expect(screen.getByText(/Completed: 2 pairs/)).toBeTruthy();
});
it("cancels and ignores messages from a terminated worker when leaving Experiments", () => {
  const view = render(<Experiments scenarios={[]} active />);
  const worker = setup();
  view.rerender(<Experiments scenarios={[]} active={false} />);
  expect(worker.terminated).toBe(true);
  act(() =>
    worker.emit({
      type: "done",
      result: { request: worker.request, pairs: [] },
    })
  );
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("cancelled");
});
it("rejects invalid setup and reports failures without a partial estimate", () => {
  render(<Experiments scenarios={[]} active />);
  fireEvent.change(screen.getByLabelText("Seed pairs"), {
    target: { value: "0" },
  });
  expect(
    (
      screen.getByRole("button", {
        name: "Run experiment",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  const worker = setup();
  act(() =>
    worker.emit({
      type: "error",
      message: "Seed 42 overflowed; experiment stops.",
    })
  );
  expect(screen.getByRole("alert").textContent).toContain("Seed 42");
  expect(screen.queryByRole("table")).toBeNull();
});
