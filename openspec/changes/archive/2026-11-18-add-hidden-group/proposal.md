# Proposal

## Why

Hiding a card (or closing its tab) removes the session from the view with no way back until it records a new event, so a mistaken click loses track of a chat. Hidden state also lives only in memory, so a window reload brings back every card the developer hid or closed.

## What Changes

- Hidden and closed sessions move to a "Hidden" group at the bottom of the view, collapsed by default, with a count; each entry has a button that shows it again.
- Hidden state is stored per machine, so reloads keep it; entries of sessions that no longer exist are dropped.
- A hidden session still returns by itself when it records a new event.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-status`: the hidden group, restoring a session, persistent hiding.

## Impact

`vscode/status-core.js`, `vscode/sessions-view.js`, `vscode/package.json`, tests, README.
