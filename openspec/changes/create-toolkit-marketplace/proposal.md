# Proposal

## Why

Personal Claude Code skills are installed by hand as release folders and symbolic links under `~/.claude/skills`, so every machine and every update needs manual work. A Git-backed plugin marketplace delivers them with Claude Code's own install and update mechanism, and is the base for the coordinator automation that follows.

## What Changes

- Add a plugin marketplace at the repository root, named `claude-toolkit`, that lists one plugin, `toolkit`.
- Move the `create-coordinator` skill (release 0.2.0: `SKILL.md`, `launch.ps1`, `resolve-projects.ps1`) into the `toolkit` plugin, byte for byte unchanged, so it runs as `/toolkit:create-coordinator`.
- Add repository guidance (`README.md`, `AGENTS.md`, `CLAUDE.md`) and a structural test.
- Install the marketplace and plugin on this machine with auto-update, then retire the old `~/.claude/skills/create-coordinator` link; the old release folder stays for rollback.
- SDD stays untouched: no SDD file, rule, skill or agent changes.

## Capabilities

### New Capabilities

- `toolkit-marketplace`: a personal plugin marketplace that installs and updates the `toolkit` plugin from Git, and the `create-coordinator` skill it provides.

### Modified Capabilities

None.

## Impact

- New repository content only; user-level Claude Code configuration gains the `claude-toolkit` marketplace and the enabled `toolkit` plugin.
- `/create-coordinator` becomes `/toolkit:create-coordinator`.
- Out of scope: the coordinator agent, worker spawning, the SessionStart mailbox hook and the VS Code extension (later changes).
