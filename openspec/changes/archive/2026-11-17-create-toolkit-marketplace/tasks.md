# Tasks

## 1. Marketplace and plugin

- [x] 1.1 Add `.gitattributes`, `.claude-plugin/marketplace.json` and `plugins/toolkit/.claude-plugin/plugin.json` (no `version`) and verify `claude plugin validate` on the root passes with no errors
- [x] 1.2 Add `tests/toolkit.test.mjs`, `tests/blackbox.test.mjs` and `tests/cli.test.mjs` (manifests, source containment, no SDD shadowing, `claude plugin validate`) and verify `node --test` passes
- [x] 1.3 Add `README.md` (local use, install, update, rollback), `AGENTS.md` and `CLAUDE.md` (`@AGENTS.md`) in English and verify every documented command matches the tested layout

## 2. Local loading

- [x] 2.1 After the developer approves the push, push to `origin` and attempt `claude plugin marketplace add dserri/claude-toolkit`; verified refused by the organization's managed policy, so the developer chose local loading with `--plugin-dir` and will request access later
- [x] 2.2 Verify by hand (developer-confirmed, not covered by `node --test`) that a session started with `--plugin-dir` loads the plugin and still offers `/sdd`, and that the SDD installation is unchanged
- [x] 2.3 Remove the copied `create-coordinator` skill at the developer's request (it coordinates several projects and does not fit the single-project coordinator) and verify the plugin contains only its manifest
