# Tasks

## 1. Fix

- [x] 1.1 Record `pid` in the hook; add `latestPerProcess` and pid matching in `status-core.js`; verify with hook and core tests
- [x] 1.2 Publish tab process ids, match focus and close by pid in `sessions-view.js`; verify VS Code loads it

- [x] 1.3 Rename the active plain tab to the session running in its process, and check the plain tab by its tracked terminal so a renamed tab is not opened twice; verify with tests

## 2. Acceptance

- [x] 2.1 With the developer: `/resume` in the plain tab leaves one card, linked to the tab and focusable, and the tab title shows the resumed chat
