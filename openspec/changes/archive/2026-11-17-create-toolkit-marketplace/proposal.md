# Proposal

## Why

The coordinator workflow (a coordinator session that creates, names and briefs worker sessions and starts with VS Code) needs a home that Claude Code can load and later install and update by itself. A Git-backed plugin marketplace gives that, kept separate from the team-shared SDD skill so the idea can be validated as a personal proof of concept before it is proposed to the team.

## What Changes

- Add a plugin marketplace at the repository root, named `claude-toolkit`, listing one plugin, `toolkit`, with no components yet.
- Add repository guidance (`README.md`, `AGENTS.md`, `CLAUDE.md`), in English like SDD, and tests that include `claude plugin validate`.
- Load the plugin locally with `--plugin-dir`: the organization's managed policy refuses non-official marketplaces until access is requested.
- SDD stays untouched: no SDD file, rule, skill or agent changes.

## Capabilities

### New Capabilities

- `toolkit-marketplace`: a personal plugin marketplace that delivers the `toolkit` plugin from Git, loadable locally today and installable once the organization allows it.

### Modified Capabilities

None.

## Impact

- New repository content only; no user-level Claude Code configuration changes.
- Out of scope: the single-project coordinator (agent, worker creation, mailbox startup hook, VS Code extension) and multi-project coordination, which follow as separate changes.
