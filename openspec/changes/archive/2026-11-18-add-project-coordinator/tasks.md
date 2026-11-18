# Tasks

## 1. Agents and board protocol

- [x] 1.1 Add `plugins/toolkit/agents/coordinator.md` and `worker.md` with the roles and the board protocol from the design, and verify `claude plugin validate` lists `toolkit:coordinator` and `toolkit:worker`
- [x] 1.2 Extend the tests for agent frontmatter, the board paths named in both prompts and the absence of an `sdd` agent, and verify `node --test` passes

## 2. Startup team recap

- [x] 2.1 Add `plugins/toolkit/hooks/hooks.json` and `session-start.mjs` and verify with tests (stub SDD script, temporary home) that the coordinator gets the recap, the no-mailbox and failure lines, and that workers and plain sessions get nothing
- [x] 2.2 Add an after-review end-to-end test that starts `claude -p --plugin-dir plugins/toolkit --agent toolkit:coordinator` and asserts the agent and hook context are active

## 3. VS Code extension

- [x] 3.1 Add `vscode/package.json` and `vscode/core.js` (names, request validation, session arguments, team list, exclude update) with tests covering valid and hostile requests, and verify `node --test` passes
- [x] 3.2 Add `vscode/extension.js` (activation, enable command, coordinator start, active worker reopen, request watcher) and verify by linking it into `~/.vscode/extensions` that VS Code loads it without errors
- [x] 3.4 Mark extension terminals transient so VS Code does not restore them as empty shells, and verify with a `terminalOptions` test
- [x] 3.5 Record worker session IDs from the SessionStart hook (start and resume) in `.coord/sessions/`, resume active workers by ID, and resume a requested worker that has a record instead of starting a new session; update the coordinator prompt; verify with hook and core tests including invalid names and missing records
- [x] 3.6 Record enablement in the extension's machine storage instead of trusting `.coord/` alone, make both settings machine-scoped, and verify with core and manifest tests
- [x] 3.3 Document install, enable, daily use and rollback in README and AGENTS.md and verify the documented commands match the layout

## 4. Acceptance in VS Code

- [x] 4.1 With the developer, enable a test project, have the coordinator create two workers, restart VS Code and verify the tabs, names, messages and board match the specs
