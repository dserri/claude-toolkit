# Proposal

## Why

The session view made jumping between sessions easy, so the developer wants it faster still: one click or one key to the session that needs them, a view that stays in the same place in every VS Code window (inside the Explorer it shifts from window to window), and the option to give each worker a full-width tab now that side-by-side placement matters less.

## What Changes

- Clicking the status-bar item focuses the longest-waiting session in any window; with nothing waiting it opens the view.
- A "Toolkit: Next waiting session" command, bound to `Ctrl+Alt+N`, cycles through waiting sessions in urgency order.
- "Claude sessions" moves to its own Activity Bar container with its own icon.
- A setting `claudeToolkit.workerLayout`: `beside` (default, today's layout) or `tabs` (workers open as tabs in the coordinator's editor group).
- Open advisory findings of the cross-window review: registry files are removed by their file name, focus requests are written atomically, the click routing gets tests, the window black-box tests clean their temporary homes, and the archived tasks wording is corrected.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-status`: status-bar jump, next-waiting command, Activity Bar placement.
- `vscode-session-launcher`: worker layout setting.

## Impact

`vscode/` (package.json, sessions view, core helpers), tests, README.
