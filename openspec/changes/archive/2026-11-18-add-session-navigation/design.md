# Design

## Context

See proposal.md. The view, the click routing (own tab, other window via registry and focus request, or message) and urgency sorting already exist. VS Code stores Explorer view placement and sizes per workspace, which is why the view shifts between windows; an Activity Bar container is a fixed home the developer can still drag elsewhere once.

## Goals / Non-Goals

**Goals:** one click or key to the waiting session; same view placement everywhere; optional full-width workers.

**Non-Goals:** notifications (later, only if red cards are missed); the coordinator reading the status files (later); the supervisor.

## Decisions

- **One focus path.** The status-bar command and the next-waiting command reuse the card click (`focus(session)`), so every route reaches other windows the same way.
- **Pure selection in `status-core.js`:** `waitingSessions(sessions)` (waiting ones in urgency order) and `nextWaiting(waiting, lastFocusedId)` (the one after the last focused, wrapping, first when unknown). The view remembers the last focused session id in memory.
- **Activity Bar container** `claudeToolkit` with an SVG icon in `vscode/media/`, holding the `claudeToolkit.sessions` view; the status-bar fallback runs `claudeToolkit.sessions.focus`.
- **Shortcut** `ctrl+alt+n` (no conflict on this machine; developers can rebind it).
- **Worker layout** read when a tab opens; `terminalOptions` takes the tab's `role` (`coordinator` or `worker`) and the `layout` instead of the `beside` flag, so core stays the single place deciding placement: coordinator in column 1 with focus, workers in column 2 (or column 1 with `tabs`) without taking focus.
- **Registry files written atomically** (found in review): readers delete unreadable window files, so each window writes its own file through a temporary file and rename, like focus requests. Reading and writing live in `vscode/registry.js`, plain Node, tested directly.
- **Follow-ups:** registry reader deletes by the file name it read (unreadable files included); focus requests written as temp file plus rename; routing decisions moved into a pure `clickAction(location)` in core and tested; the window black-box tests remove their temporary homes; the archived `add-cross-window-focus` task 2.1 wording matches the helpers that exist.

## Risks / Trade-offs

- [`ctrl+alt+n` may collide with other extensions on other machines] → a normal VS Code keybinding, rebindable.
- [Users with the view already dragged elsewhere] → VS Code keeps a moved view where the user put it.
