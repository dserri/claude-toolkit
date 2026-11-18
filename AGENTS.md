# claude-toolkit

Private Claude Code plugin marketplace (`claude-toolkit`) with one plugin, `toolkit`, and a companion VS Code extension: a personal proof of concept for a project coordinator that creates and follows worker sessions. See [README.md](README.md) for setup, daily use and the board format.

## Layout

| Path | Contents |
|---|---|
| `.claude-plugin/marketplace.json` | Marketplace catalogue; plugins are listed by relative `source` |
| `plugins/toolkit/.claude-plugin/plugin.json` | Plugin manifest; no `version`, so each pushed commit is a release |
| `plugins/toolkit/agents/` | `coordinator` and `worker` agents; their prompts define the board protocol |
| `plugins/toolkit/hooks/` | SessionStart hook: SDD team-mailbox pull for the coordinator only |
| `vscode/` | VS Code extension, plain CommonJS with no dependencies or build: `core.js` and `status-core.js` (pure logic, tested), `extension.js` and `sessions-view.js` (VS Code glue) |
| `status/` | Session status: `status-hook.mjs` (user-level async hook for every interactive session, writes `~/.agent-status/sessions/*.jsonl`) and `install.mjs` (adds/removes its entries in `~/.claude/settings.json` after a backup) |
| `tests/` | `node --test` (unit, hooks, installer, `claude plugin validate`); `tests/*.e2e.mjs` start real headless sessions |
| `openspec/` | OpenSpec specs and changes |

## Rules

- Compatible with SDD, separate from it: never change SDD files, rules, skills or agents, never name a skill or agent `sdd`, and use SDD only through its documented commands (the hook runs `complete-change.mjs --collab pull` and nothing else). Everything is written in English, like SDD.
- The board format lives in three places that must agree: the agent prompts, `vscode/core.js` and the README table. `tests/toolkit.test.mjs` pins the shared paths and the request shape.
- The extension starts Claude without a shell (`shellPath` plus `shellArgs`) and only with validated worker names; never build a command line from request content.
- The organization's managed policy blocks non-official marketplaces, so sessions load this clone with `--plugin-dir`: every saved file, committed or not, is live in the next session, and the extension after a VS Code reload.
- The status hook runs on every tool call of every session: it must stay asynchronous, print nothing, always exit 0 and log its errors to `~/.agent-status/hook.log`. The status rules live only in `vscode/status-core.js`; the hook just records events.
- Run `node --test` before committing.
- `.gitattributes` keeps LF line endings so checkouts on Windows stay byte-identical.
