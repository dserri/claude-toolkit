# Design

## Context

See proposal.md. The view uses `registerTreeDataProvider`; groups and cards are sorted by `byUrgency`. VS Code supports reordering through a `TreeDragAndDropController` passed to `createTreeView`.

## Decisions

- **Order as key lists** in `globalState` key `sessionOrder` = `{ projects: [project], sessions: { [project]: [session key] } }`. A titled session's key is its name (stable across restarts); an untitled one, named after its folder and not unique, is keyed `id:<session id>` (found in review).
- **Reorders merge, never replace** (found in review): the new list is the displayed keys merged with stored keys not displayed (each kept after its stored predecessor), so hidden sessions and projects without live sessions keep their place.
- **Keyboard alternative** (found in review): "Move up" / "Move down" in the context menu of sessions and projects (reachable with Shift+F10) apply the same move as a drag.
- **Unreadable files** (found in review): `vscode/session-files.js` reports files without parsed events separately, and pruning keeps their hidden entries.
- **Pure helpers in `status-core.js`:** `applyOrder(items, keys, keyOf, fallback)` puts items whose key is listed first in list order, then the rest by `fallback`; `moveBefore(keys, moved, target)` returns the keys with `moved` placed before `target`, or last when `target` is absent. On a drop the view takes the keys as currently displayed, moves one, and stores the full list, so everything displayed becomes placed.
- **Drag and drop:** `createTreeView` with a controller using one mime type for this view; the drag carries the dragged element's kind, project and order key (`sessionKey`); drops are accepted only session→session or session→own project (same project) and project→project.
- **Reset:** command clears `sessionOrder`.
- **Review fixes:** one `persist(key, value)` helper awaits the update, refreshes, and shows an error message if it fails; `readSessions` skips files with no parsed events; the hidden group label becomes `Hidden (n)`.

## Risks / Trade-offs

- [Two sessions with the same name in different projects] → order lists are per project, so names only need to be unique within a project, which session names are.
