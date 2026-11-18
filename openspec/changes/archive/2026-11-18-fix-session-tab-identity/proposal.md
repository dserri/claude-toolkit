# Proposal

## Why

Bug reported by the developer: in a plain `claude` tab they used `/resume` to continue a chat started in another terminal. The tab now runs the resumed session, but the old `<project>-claude` card stayed, and the resumed chat's card said "not in a toolkit tab". `/resume` (and `/clear`) switch the session inside the same Claude process without a SessionEnd, and the view links cards to tabs by session name, which changes on resume, clear and rename.

## What Changes

- The status hook records the Claude process id (`CLAUDE_PID`) with each session.
- Each window publishes the process ids of the tabs it opened; cards are linked to tabs by process id first, name second.
- When a newer session reports the same process id, older sessions of that process are no longer shown.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-status`: tab identity by process, superseded sessions.

## Impact

`status/status-hook.mjs`, `vscode/status-core.js`, `vscode/sessions-view.js`, `vscode/core.js`, `vscode/extension.js`, tests.
