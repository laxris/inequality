// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Help } from "./Help";
import { NumberField } from "./Composer";
afterEach(cleanup);
it("shows explanations on hover and dismisses them with Escape", () => {
  render(<Help label="Gini">Concentration, not mobility.</Help>);
  fireEvent.mouseEnter(
    screen.getByRole("button", { name: "About Gini" }).parentElement!
  );
  expect(screen.getByRole("tooltip").textContent).toBe(
    "Concentration, not mobility."
  );
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
});
it("supports keyboard focus and touch without changing an input", () => {
  render(
    <NumberField
      label="Success probability"
      value={0.65}
      max={1}
      onChange={() => {
        throw new Error("Help changed the input");
      }}
    />
  );
  const input = screen.getByLabelText("Success probability");
  const button = screen.getByRole("button", {
    name: "About Success probability",
  });
  fireEvent.focus(button);
  expect(screen.getByRole("tooltip").textContent).toContain("65%");
  expect(input.getAttribute("aria-describedby")).toBe(
    screen.getByRole("tooltip").id
  );
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(button);
  expect(screen.getByRole("tooltip")).toBeTruthy();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("tooltip")).toBeNull();
});
