# Proposal

## Why

Closed sessions stay in the view: closing a tab, a terminal or a VS Code window kills Claude without a SessionEnd, so the card lingers until the 6-hour cleanup. Since the hook records the Claude process id, the view can tell that a session's process has ended.

## What Changes

- A session whose recorded Claude process no longer runs is not shown, neither in its project nor in the hidden group. Sessions without a recorded process keep the 6-hour rule.
- The stored order drops keys of untitled sessions (`id:<id>`) that no longer exist, so it does not grow without limit.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-status`: ended sessions are dropped; order pruning.

## Impact

`vscode/status-core.js`, `vscode/sessions-view.js`, tests, README.
