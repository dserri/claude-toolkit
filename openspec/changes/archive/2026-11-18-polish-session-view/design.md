# Design

## Decisions

- **Rename decision** `plainTabRename({ sessionName, lastApplied, tabName, otherTabNames, defaultSessionName })` returns the new name only when the session name exists and differs from the last name the extension applied, from the current tab name and from the tab's own default session name (`<project>-claude`, so a fresh tab stays `claude`), and is neither `coordinator`, `claude` nor the name of another open tab of the window. The view keeps the last applied session name per plain terminal (`WeakMap`) and records it whenever the session name is seen, renamed or not, so a name typed by the developer survives until the session changes.
- **Order pruning** takes the unreadable ids from the last read and keeps their `id:` keys.
- **Move guard:** `move(undefined, …)` returns.
- **Hook folder name** splits the project path on both `/` and `\` (found running the suite in a Linux container: Node's `basename` splits only on the platform's separator).

## Limitations

- The rename wiring in `sessions-view.js` (last-applied tracking, other tab names, active-terminal guard) is covered only through the pure decision function; the developer pushed before trying it by hand. Follow-up: try a typed tab name and a `/resume` in the plain tab.
