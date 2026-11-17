# Tasks

## 1. Marketplace and plugin

- [x] 1.1 Add `.gitattributes`, `.claude-plugin/marketplace.json` and `plugins/toolkit/.claude-plugin/plugin.json` (no `version`) and verify `claude plugin validate` on the root passes with no errors
- [x] 1.2 Copy `create-coordinator` 0.2.0 into `plugins/toolkit/skills/create-coordinator` byte for byte and verify `claude plugin validate` lists the skill
- [x] 1.3 Add `tests/toolkit.test.mjs` (manifests, skill frontmatter, SHA-256 against the 0.2.0 manifest, byte order marks) and verify `node --test` passes
- [x] 1.4 Add `README.md` (install, update, rollback, skill names), `AGENTS.md` and `CLAUDE.md` (`@AGENTS.md`) and verify every command in the README matches the tested layout

## 2. Installation on this machine

- [ ] 2.1 After the developer approves the push, push to `origin`, run `claude plugin marketplace add dserri/claude-toolkit` and `claude plugin install toolkit@claude-toolkit`, and verify `claude plugin list` shows it enabled
- [ ] 2.2 Enable auto-update for `claude-toolkit` and verify it in the marketplace configuration
- [ ] 2.3 Verify a new session lists `toolkit:create-coordinator` and still resolves `/sdd` from the unchanged SDD installation, then, with the developer's confirmation, remove the `~/.claude/skills/create-coordinator` link
