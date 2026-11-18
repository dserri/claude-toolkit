# Proposal

## Why

A colleague wants to try the session view and the automatic Claude tab without adopting the coordinator workflow. Today the status line lives only in the coordinator and worker prompts, and the only automatic start is the coordinator, which needs the toolkit plugin. The sessions part must be installable and useful on its own.

## What Changes

- The status installer also registers a small synchronous SessionStart hook that tells every interactive session to end each turn with `STATUS: QUESTION` or `STATUS: DONE`; headless sessions (SDD's reviewer, `claude -p`) are skipped so their output format is untouched.
- The extension gains a plain mode: "Toolkit: Open Claude here on startup" records the folder on this machine and, whenever it opens, starts one plain Claude tab (no agent, no plugin, no prompt), named so the session view can focus it. "Toolkit: Stop opening Claude here" removes either mode from the folder.
- A folder enabled for the coordinator keeps the coordinator; the plain mode applies only to folders not enabled for it.
- README splits setup into "Claude sessions" (extension link plus status hooks; no plugin) and "Coordinator" (adds the plugin and the coordinator enable command).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-status`: the turn status instruction for every interactive session.
- `vscode-session-launcher`: the plain auto-open mode and the stop command.

## Impact

`status/` (new hook script, installer), `vscode/` (commands, plain mode), tests, README. Existing coordinator behaviour unchanged.
