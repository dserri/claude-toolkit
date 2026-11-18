# Tasks

## 1. Hook

- [x] 1.1 Write an `.ended` marker at SessionEnd and record nothing for a session that has one; remove markers with the stale cleanup; verify with hook tests

## 2. Window registry and focus

- [x] 2.1 Add pure helpers (live-window filter, session location, location label, latest session per title) to `vscode/status-core.js` with tests
- [x] 2.2 Publish and remove the window file, watch the window's own focus request, and route clicks to this window, another window or a message in `sessions-view.js`; verify VS Code loads it without errors
- [x] 2.3 Correct the archived proposal wording and document cross-window focus in README

## 3. Acceptance

- [x] 3.1 With the developer and two VS Code windows, click a card held by the other window and verify the window comes to the front with the right tab; click a hand-started session and verify only a message appears
