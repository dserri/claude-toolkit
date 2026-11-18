# Design

## Context

Observed: after `/resume` in the plain tab, the session files show the old session (`backoffices-claude`, SessionStart only) and the resumed one (`test-chat`, SessionStart with source `resume`); no SessionEnd for the old one. Hooks receive `CLAUDE_PID`, the Claude process id; the extension starts Claude directly as the terminal process, so `terminal.processId` is that same process.

## Decisions

- **Hook:** SessionStart and UserPromptSubmit lines carry `pid` (integer from `CLAUDE_PID`, omitted when absent or invalid). These two events are enough: every session switch starts with one of them.
- **Fold:** `sessionState` exposes the latest `pid`. `latestPerProcess(sessions)` keeps, among sessions with the same pid, only the one with the latest event; sessions without pid are untouched. Applied together with `latestPerTitle`.
- **Registry:** window entries gain `pids` (process ids of the tabs in `tabsBySession`, read through `terminal.processId`); publishing becomes asynchronous. `sessionLocation` matches `pids` first, then names. Focus requests carry the session's pid and name; the receiving window shows the tab whose process id matches, else the tab with that name.
- **Plain tab name** (developer request during the fix): VS Code offers no API to rename a terminal, only the command `workbench.action.terminal.renameWithArg`, which acts on the active terminal. So on every refresh and whenever the active terminal changes, if the active terminal is a plain tab this window opened and the session on its process has another name, the extension runs that command. Coordinator and worker tabs keep their names, which identify them for duplicate checks and requests.
- **Duplicate check by terminal** (found in review): a renamed plain tab no longer has the title `claude`, so "already open" checks the terminal tracked for that session name first (still among VS Code's terminals), then the title.
- **Closing a tab** hides the cards of sessions with that tab's process id, or its name.

## Risks / Trade-offs

- [Process ids are reused by the OS] → only sessions within the 6-hour window are compared, and the older one is the one dropped.
- [A Claude launcher process between the terminal and Claude would break pid matching] → name fallback keeps today's behaviour; acceptance checks the pid match on this machine.
