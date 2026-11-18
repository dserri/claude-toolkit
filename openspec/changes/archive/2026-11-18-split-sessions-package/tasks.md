# Tasks

## 1. Status line hook

- [x] 1.1 Add `status/turn-status-hook.mjs` and register it in the installer (sync, no matcher); verify with hook and installer tests, including headless and uninstall

## 2. Plain mode

- [x] 2.1 Add `plainArgs` and the plain/stop record helpers to `vscode/core.js` with tests
- [x] 2.2 Add the two commands and the startup choice in `extension.js`/`package.json`; verify VS Code loads them

## 3. Documentation and acceptance

- [x] 3.1 Split README setup into "Claude sessions" and "Coordinator"
- [x] 3.2 With the developer: in a folder without the coordinator, enable plain mode, reopen VS Code, see the `claude` tab and its card; a new session ends turns with the STATUS line
