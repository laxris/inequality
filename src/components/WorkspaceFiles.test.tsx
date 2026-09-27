// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceFiles } from "./WorkspaceFiles";
import { createWorkspace } from "../workspace";
import { serializeWorkspaceFile } from "../workspaceFile";
import { presets } from "../simulation/presets";
afterEach(cleanup);
it("rejects bad imports without replacement and previews valid files before restoring", async () => {
  const workspace = createWorkspace(presets[0].experiment);
  const restore = vi.fn();
  render(<WorkspaceFiles workspace={workspace} restore={restore} />);
  const input = screen.getByLabelText("Import workspace JSON");
  fireEvent.change(input, { target: { files: [{ size: 1, text: async () => "bad" }] } });
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("has not been replaced"));
  expect(restore).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { files: [{ size: 1, text: async () => serializeWorkspaceFile(workspace) }] } });
  await screen.findByRole("button", { name: "Replace workspace" });
  expect(restore).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Replace workspace" }));
  expect(restore).toHaveBeenCalledWith(workspace);
});
