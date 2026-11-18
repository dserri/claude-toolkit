# Tasks

## 1. Hook and installer

- [x] 1.1 Add `status/status-hook.mjs` (event filter, headless skip, append, compaction on UserPromptSubmit, delete on SessionEnd, stale cleanup on SessionStart, silent errors to `hook.log`) and verify with tests on a temporary home, including unreadable input and headless sessions
- [x] 1.2 Add `status/install.mjs` (backup, idempotent add, uninstall of own entries only) and verify with tests on a temporary settings file holding existing hooks
- [x] 1.3 Add a test that the installed CLI still reports `CLAUDE_CODE_ENTRYPOINT=sdk-cli` to hooks of a `claude -p` session (after review, needs a model call)

## 2. Status logic and view

- [x] 2.1 Add `vscode/status-core.js` (fold with prompt ordering, status rules, stuck threshold, urgency sort, card labels) and verify with tests covering out-of-order events, permission answered, questions and the stuck case
- [x] 2.2 Add the "Claude sessions" view, status-bar count, focus and hide in `extension.js`/`package.json`, and verify VS Code loads it without errors
- [x] 2.3 Add the `STATUS:` line rule to the coordinator and worker prompts and verify with the agent prompt tests

## 3. Documentation and acceptance

- [x] 3.1 Document install, the view, thresholds, the headless rule and rollback in README and AGENTS.md
- [x] 3.2 Install on this machine and, with the developer, verify three real sessions: one working, one on a permission prompt, one finished; cards change by themselves, clicking focuses the tab, a closed session disappears
