# Design

## Context

See proposal.md for the motivation. Verified on this machine (Claude Code 2.1.326, VS Code 1.146, Windows 11): `claude --agent toolkit:coordinator --name <name>` starts a session as a plugin agent; the SessionStart hook input carries `agent_type` only for agent sessions, and a hook-run SDD pull takes about 0.8 s; `claude --resume <name>` resumes by exact name but needs `--agent` and `--plugin-dir` again; sessions on one machine message each other with SendMessage only when they run in the same permission mode. The developer's global instructions already tell Claude to report a hook-provided recap and not pull again. Claude Code cannot open a VS Code tab itself, hence the extension. No VS Code policy restricts extensions on this machine.

## Goals / Non-Goals

**Goals:** opening an enabled project is the only daily step; the developer talks to the coordinator; workers are created per task and reopened while they have open work.

**Non-Goals:** several projects in one coordinator (later change); publishing the extension; closing tabs automatically; changing SDD or the global instructions.

## Decisions

- **Two plugin agents, `coordinator` and `worker`.** Their prompts hold the roles and the board protocol, so the briefs only carry the task. Alternative: one generic prompt passed on the command line, rejected because a resumed session would lose it. Plugin agents ignore `permissionMode`, so the launcher passes `--permission-mode auto` (same mode in every session, so messages need no approval).
- **Board layout** in `<project>/.coord/`: `team.json` (`[{ "name", "role", "state": "active" | "done" }]`, written by the coordinator), `workers/<name>/brief.md` (coordinator), `workers/<name>/status.md` (worker), `requests/<name>.json` (coordinator asks for a tab; the extension deletes it once handled, or writes `requests/<name>.rejected.md`), `log.md` (coordinator). Plain files keep state readable by the developer and survive restarts.
- **Coordinator starts fresh each time** (`--name <project>-coordinator`, opening prompt: report the team recap, read the board, summarize open work, ask what is next). Resuming yesterday's transcript would fill its context within days; the board carries the state. **Workers are resumed** (`--resume <project>-<name>`) because their in-flight context is valuable.
- **Request handling in the extension, not a skill.** The coordinator writes the request with its normal file tools; the extension validates it. Validation: name `^[a-z0-9][a-z0-9-]{0,39}$`, not already open in this window, `workers/<name>/brief.md` present; the request carries nothing else that reaches the command. The worker prompt is the fixed text "Read .coord/workers/<name>/brief.md and follow it.", with `<name>` already validated.
- **Terminals without a shell:** `vscode.window.createTerminal({ name, shellPath: claude, shellArgs: [...], cwd, location: { viewColumn } })`. The coordinator opens in the first editor column, workers beside it. `claude` resolves from `PATH`, overridable with the setting `claudeToolkit.claudePath`.
- **Plugin directory:** derived from the extension's real path (`<clone>/vscode` → `<clone>/plugins/toolkit`), so a junction install needs no setting; overridable with `claudeToolkit.pluginDir`.
- **Extension shape:** plain CommonJS, no dependencies and no build. `vscode/core.js` holds pure logic (names, request validation, command arguments, team list parsing, exclude-file update) and is tested with `node --test`; `vscode/extension.js` is the thin VS Code glue (activation on startup, file watcher on `.coord/requests`, commands). Installed by linking `<clone>/vscode` into `~/.vscode/extensions/dserri.claude-toolkit-0.0.1` with a directory junction, so a `git pull` updates it after a window reload.
- **Mailbox hook:** `hooks/session-start.mjs`, registered for `startup|resume`. The team pull happens only when `agent_type` is `toolkit:coordinator` and the session is starting, not resuming; then it runs `node ~/.claude/skills/sdd/scripts/complete-change.mjs --collab pull --repository <cwd>` with a 60 s timeout and returns `additionalContext` with the recap, "no team mailbox for this project", or "team pull failed: <first line>". It never writes the mailbox store.
- **Resume by session ID:** found in acceptance, requesting a done worker again starts a second session with the same name, so `--resume <name>` became ambiguous and opened the picker. The SessionStart hook already receives `session_id` and the `--name` value as `session_title` (resuming keeps the ID, verified), so for `toolkit:worker` sessions, at start and at resume (the hook matcher becomes `startup|resume`; the team pull stays start-only), it writes `.coord/sessions/<session_title>.id`. The extension resumes with that ID and falls back to the name only without a record. A request for a worker that has a record resumes that session with the fixed prompt "Read the newest section of .coord/workers/<name>/brief.md and follow it." instead of starting a new one, so a done worker given new work keeps its context and its name stays unique. Keying by the full session name keeps the prefix rule in one place (`core.js`).
- **Enablement lives on the machine, not in the repository:** found in review, a committed `.coord/` would otherwise start auto-mode sessions in any clone, and workspace settings could redirect the executable or plugin. The enable command stores the folder's key (resolved path, lowercased on Windows) in the extension's `globalState`; activation starts only folders recorded there that have `.coord/`. `claudeToolkit.claudePath` and `claudeToolkit.pluginDir` use `"scope": "machine"`, so only user settings apply.
- **Requests still being written:** VS Code can report a new request file before its content is complete. Unreadable JSON from the watcher is left in place for the change event that follows the write; any other invalid request is rejected at once. Files found at start-up are complete, so unreadable ones are rejected there.
- **Session names come from the folder name only:** two enabled projects with the same folder name would share names; accepted for the single-project proof of concept and documented.
- **Terminals are transient** (`isTransient: true`): found in acceptance, VS Code otherwise restores closed-window terminals as empty default shells; the extension recreates its tabs itself.
- **Tests:** `node --test` covers core logic (including hostile names and paths), the hook with a stub SDD script under a temporary home, and agent and hook manifests. An end-to-end check that starts a real `claude -p --agent toolkit:coordinator` session is marked to run after review (it needs the network and a model call). Tab behaviour in VS Code is accepted by the developer.

## Risks / Trade-offs

- [A worker's session no longer exists, so `--resume` opens the session picker] → the developer picks or closes it; the coordinator sees the worker missing in ListAgents and can request it again.
- [Auto permission mode lets sessions act without prompts] → it is the mode the developer already uses for these sessions; the board and agents add no new permissions.
- [Request files are an input the extension acts on] → only names matching the strict pattern and an existing brief open a terminal; arguments never pass through a shell.
- [`--plugin-dir` loads a plugin outside the organization's marketplace allowlist] → the developer's explicit choice for local testing (see the archived `create-toolkit-marketplace` change).
- [Every worker still runs the SDD first-turn pull from the global instructions] → unchanged SDD behaviour; acceptable cost of staying compatible.

## Migration Plan

1. Link the extension, reload VS Code, run "Toolkit: Enable coordinator in this folder" in one project.
2. Rollback: delete the junction (and `.coord/` if wanted); sessions started by hand work as before.
