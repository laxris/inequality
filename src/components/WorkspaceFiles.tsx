import { useRef, useState } from "react";
import type { Workspace } from "../workspace";
import { parseWorkspaceFile, serializeWorkspaceFile, WORKSPACE_FILE_LIMIT } from "../workspaceFile";
import { Help } from "./Help";

export function WorkspaceFiles({ workspace, restore }: { workspace: Workspace; restore: (value: Workspace) => void }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Workspace | null>(null);
  const selection = useRef(0);
  function download() {
    try {
      const contents = serializeWorkspaceFile(workspace);
      const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "wealth-lab-workspace.json";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setError("");
      setMessage("Workspace exported. Imports restore all scenario runs paused.");
    } catch (cause) {
      setError(`Could not export: ${cause instanceof Error ? cause.message : "Invalid workspace"} Correct incomplete draft inputs or targets before exporting.`);
    }
  }
  return <section className="panel workspace-files" aria-label="Workspace files">
    <button onClick={download}>Export workspace JSON</button>
    <label>Import workspace JSON <input type="file" accept=".json,application/json" onChange={async event => {
      const file = event.target.files?.[0];
      event.target.value = "";
      const request = ++selection.current;
      setPending(null); setError(""); setMessage("");
      if (!file) return;
      try {
        if (file.size > WORKSPACE_FILE_LIMIT) throw Error("Workspace file exceeds 50 MiB.");
        const parsed = parseWorkspaceFile(await file.text());
        if (request === selection.current) setPending(parsed);
      } catch (cause) {
        if (request === selection.current) setError(`Could not import: ${cause instanceof Error ? cause.message : "Invalid file"}. Your workspace has not been replaced.`);
      }
    }} /></label>
    <Help label="Workspace files">Save scenario names, applied rules, valid pending drafts, current participants, round, random state, Treasury, ledger, retained history, mobility references and playback settings. Imports replace the scenario tabs after confirmation and start paused. This stores state without replaying old rounds. Paired experiment results have their own Download results button and are not included here. Files stay on your device; nothing is uploaded.</Help>
    {pending && <div className="notice">
      <p>Ready to restore {pending.scenarios.length} scenario(s): {pending.scenarios.map(s => `${s.name || `Scenario ${s.id}`} (round ${s.state.round})`).join(", ") || "empty workspace"}. This replaces your current tabs and clears paired experiment results. Export them first if you want to keep them.</p>
      <button onClick={() => { restore(pending); setPending(null); setMessage("Workspace restored. All runs are paused; use Run or Run to target to continue."); }}>Replace workspace</button>{" "}
      <button onClick={() => { selection.current++; setPending(null); }}>Cancel import</button>
    </div>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
