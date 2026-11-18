# Proposal

## Why

The session view shows sessions from every VS Code window, but a click only focuses tabs of the window it is in. With several projects open in several windows, the developer sees a red card and still has to hunt for the window. Opening a folder that is already open brings its window to the front (verified on this machine), so a click can reach any window without a server.

## What Changes

- Each VS Code window publishes which session tabs it holds in `~/.agent-status/windows/<pid>.json`, and removes the file when it closes.
- Clicking a card of a session held by another window asks that window to show the tab (a request file it watches) and brings the window to the front by opening its folder.
- A card says where its session runs (this window, another window by folder, or not a toolkit tab) in its tooltip.
- Fixes from the previous review: a late event after SessionEnd no longer recreates an ended session's card; the archived proposal's "running tool" wording is corrected.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-status`: focusing reaches tabs in other VS Code windows, cards say where their session runs, and ended sessions stay ended.

## Impact

- `vscode/` (view, window registry, focus requests), `status/status-hook.mjs` (ended marker), tests, README.
- New files under `~/.agent-status/windows/` and `~/.agent-status/focus/`.
