# Tasks

## 1. Logic

- [x] 1.1 Add `waitingSessions`, `nextWaiting` and `clickAction` to `vscode/status-core.js`, change `terminalOptions` to take a role and a layout, and verify with tests including wrap-around and an unknown last session

## 2. VS Code

- [x] 2.1 Status-bar command and "Next waiting session" command with `ctrl+alt+n`, Activity Bar container with icon, `claudeToolkit.workerLayout` setting; verify VS Code loads them
- [x] 2.2 Registry deletion by file name, atomic focus requests, black-box temp cleanup, archived wording; verify with tests
- [x] 2.3 Document the shortcut, the status-bar jump, the container and the layout setting in README

## 3. Acceptance

- [x] 3.1 With the developer: status-bar click and shortcut reach waiting sessions in both windows, the container sits in the same place in both windows, and `tabs` layout opens a worker full width
