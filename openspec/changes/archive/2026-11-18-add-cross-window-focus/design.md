# Design

## Context

See proposal.md. Verified on this machine: running `code <folder>` for a folder already open in a window brings that window to the front, and Windows allows it. Each window's extension already tracks the session names of the tabs it opened (`tabsBySession`). Session files hold only the folder name, not the path. The previous review left three advisory findings: a late async event after SessionEnd recreates the session file; the card itself does not say where a session runs; the archived proposal says "running tool".

## Goals / Non-Goals

**Goals:** one click reaches the right tab in any window; no server or background process.

**Non-Goals:** focusing sessions running outside the extension's tabs (hand-started terminals, other apps); the supervisor.

## Decisions

- **Window registry files** instead of session-level paths: `~/.agent-status/windows/<pid>.json` = `{ pid, folder, sessions: [names] }`, written on start and on every tab open/close, deleted on deactivate. A file whose pid no longer runs (`process.kill(pid, 0)` throws) is ignored and removed by the next window that reads it. This tells exactly which window holds a session, so a click never opens a window for a session that has none.
- **Raising the window:** `vscode.commands.executeCommand('vscode.openFolder', Uri.file(folder), { forceNewWindow: true })`; VS Code focuses the window that already has the folder open instead of opening another. If that check fails in acceptance, fall back to running the VS Code CLI with the folder, which was verified directly.
- **Showing the tab:** the clicking window writes `~/.agent-status/focus/<target pid>.json` = `{ session, at }`; each window watches only its own file, shows the tab whose session name matches one of its own tabs, and deletes the file. Nothing in the request reaches a command line or path except the target pid, which comes from the registry, not from the request.
- **Ended marker:** at SessionEnd the hook deletes the session file and writes `<session_id>.ended`; any later event finding that marker records nothing. The marker is removed by the existing stale cleanup (6 hours).
- **Project from the project root** (found in acceptance: coordinators working in `.coord/` were grouped under `.coord`): the hook records the folder name of `CLAUDE_PROJECT_DIR`, which Claude Code sets for hooks and which does not follow the agent's `cd`, falling back to `cwd`.
- **Latest session per title** (found in acceptance: a window reload kills its tabs without SessionEnd, and the in-memory "closed tab" hiding is lost with the reload): toolkit session names are unique by design, so an older session with the same title is dead or superseded; the view keeps only the latest. Sessions without a title are named after their folder and are never merged.
- **Card location in the tooltip**, from the registry: "in this window", "in window <folder>", or "not in a toolkit tab".
- **Archived wording:** correct "running tool" to "last tool used" in the archived `add-session-status` proposal.

## Risks / Trade-offs

- [`vscode.openFolder` might open a second window instead of focusing] → verified in acceptance; CLI fallback ready.
- [Two windows with the same folder] → the registry names the pid, so the request reaches the right window; raising by folder may bring the other one forward, a rare case left as is.
- [Registry left behind by a crash] → pid liveness check.
