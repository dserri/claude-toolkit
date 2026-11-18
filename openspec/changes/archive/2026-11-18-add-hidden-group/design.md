# Design

## Context

See proposal.md. The view keeps a `hidden` map (session id → latest event time when hidden) in memory; `isVisible` returns a session once it records a newer event.

## Decisions

- **Pure split in `status-core.js`:** `splitHidden(sessions, hidden)` returns `{ visible, hidden }` (hidden newest first) and `pruneHidden(hidden, sessions)` keeps only entries whose session still exists and has no newer event. The view prunes after each read, so storage cannot grow.
- **Storage:** `globalState` key `hiddenSessions` (a plain object), written on hide, show again and prune. Session ids are unique per machine, so global storage is shared correctly between windows.
- **Tree:** root = project groups, then the hidden group (`TreeItemCollapsibleState.Collapsed`, label "Hidden", description = count, `eye-closed` icon). Hidden entries use `contextValue` `hiddenSession`, with the inline command "Show again" (`eye` icon); visible cards keep the hide button. Clicking any entry still focuses its tab.
- **Status bar** counts visible sessions only, as before.

## Risks / Trade-offs

- [Two windows hide at the same moment] → last write wins; the next refresh in each window reads the stored map.
