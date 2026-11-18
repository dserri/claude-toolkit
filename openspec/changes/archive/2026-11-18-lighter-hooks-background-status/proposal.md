# Proposal

## Why

Measured on this machine: Claude Code runs every hook as `claude → bash → bash → node`, about 250 ms of CPU and roughly 60 MB for its short life, and the status hook ran on every tool call of every session. Most tool calls are read-only (Read, Grep, Glob), whose PostToolUse adds nothing the view needs. Separately, a session that ends its turn while a background task runs is shown yellow "finished" although it is still working.

## What Changes

- PostToolUse and PostToolUseFailure status hooks are registered with a matcher that excludes read-only tools; re-running the installer updates existing installs.
- The "possibly stuck" default rises from 10 to 15 minutes, since read-only stretches no longer produce events.
- A Stop with running background tasks shows a new status "working in background", with its own colour and the number of tasks; it changes with the session's next event, including the turn Claude starts when a task finishes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-status`: fewer hook processes, background status.

## Impact

`status/install.mjs`, `status/status-hook.mjs`, `vscode/status-core.js`, `vscode/package.json`, `vscode/sessions-view.js`, tests, README, INSTALL.md. Needs one installer rerun per machine.
