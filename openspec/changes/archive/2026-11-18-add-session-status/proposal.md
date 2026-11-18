# Proposal

## Why

With many Claude Code sessions open in parallel, the developer loses track of which ones wait for an answer or a permission. The coordinator flags them, but it infers state, so it is slow and sometimes wrong. Session state must come from deterministic hook events and be visible at a glance, with one click to the waiting tab.

## What Changes

- Add a status hook registered at user level for every interactive Claude Code session (headless `claude -p` and SDK sessions are skipped). It runs asynchronously, so sessions never wait for it, and records each relevant event in a per-session file under `~/.agent-status/sessions/`.
- Add an installer that backs up `~/.claude/settings.json` and adds or removes only the toolkit's hook entries.
- Extend the VS Code extension with a "Claude sessions" view and a status-bar count: one card per session with a colour-coded status, how long it has been in it, the last line of its last message and the last tool used, sorted by urgency; clicking a card focuses its tab when the tab belongs to this window; a card can be hidden until the session's next event.
- Add a closing `STATUS: QUESTION` / `STATUS: DONE` line to the coordinator and worker prompts only; other sessions use the `AskUserQuestion` event and a question-mark heuristic.
- No server, no listening port, no background process. The coordinator does not read the state yet.

## Capabilities

### New Capabilities

- `session-status`: deterministic per-session status from hook events, its storage, and its view in VS Code.

### Modified Capabilities

- `project-coordinator`: the coordinator and worker prompts end each turn with a status line.

## Impact

- New `status/` folder (hook and installer), new view code in `vscode/`, tests extended.
- User-level `~/.claude/settings.json` gains asynchronous hook entries pointing at the clone (backed up first); `~/.agent-status/` holds the state.
- Relies on an observed, undocumented environment variable (`CLAUDE_CODE_ENTRYPOINT`) to skip headless sessions; a test pins it.
- SDD is unchanged; its headless reviewer sessions are skipped by the hook.
