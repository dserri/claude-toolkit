# Proposal

## Why

The developer wants to arrange the session view as they work: projects in their own order and sessions inside a project in their own order, instead of the automatic urgency sort that, for example, lifts an idle session they rarely use.

## What Changes

- Sessions can be dragged to a new position inside their project, and projects can be dragged among projects; a session cannot be dropped into another project.
- The developer's order wins over urgency. Colours, the status-bar jump and the next-waiting shortcut keep finding waiting sessions. Sessions and projects never placed by hand appear after the placed ones, sorted by urgency.
- "Toolkit: Reset session order" returns to automatic sorting.
- The order is stored per machine and shared by all windows.
- Fixes from the hidden-group review: storage writes report failures; an unreadable or empty session file no longer counts as new activity; the hidden group label reads "Hidden (n)".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-status`: manual ordering and the review fixes.

## Impact

`vscode/status-core.js`, `vscode/sessions-view.js`, `vscode/package.json`, tests, README.
