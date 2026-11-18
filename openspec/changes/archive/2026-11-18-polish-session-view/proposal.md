# Proposal

## Why

The last reviews left small issues: the plain tab's automatic rename overrides a name the developer typed and can take a name that identifies another tab; a reorder while a session file is briefly unreadable can drop that session's placement; Move up/Move down throws without a selected item; a few documents drifted from the code.

## What Changes

- The plain tab is renamed only when the session running in it changes, never to `coordinator`, `claude` or the name of another open tab; a name typed by the developer stays until the next session change.
- Order pruning keeps keys of sessions whose files are briefly unreadable.
- Move up/Move down do nothing without an item.
- The status hook takes the project folder name from either path separator, so it is the same on Windows, macOS and Linux.
- Layout and document corrections (archived `add-manual-order` and `fix-session-tab-identity` records).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-status`: plain tab rename rules and order pruning.

## Impact

`vscode/status-core.js`, `vscode/sessions-view.js`, `status/status-hook.mjs`, tests, archived OpenSpec documents.
