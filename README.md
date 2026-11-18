# claude-toolkit

Personal Claude Code plugins, laid out as a private plugin marketplace. A proof of concept: it is compatible with the team-shared SDD skill but entirely separate from it, and never changes it. Every toolkit agent carries the `toolkit:` prefix.

## What it does

Two parts, installable separately. **[INSTALL.md](INSTALL.md) is the setup guide** (written so Claude Code can follow it for you).

1. **Claude sessions**: a "Claude sessions" view with the live, colour-coded status of every Claude session on the machine, a status-bar count, `Ctrl+Alt+N` to jump to waiting sessions, click-to-focus across VS Code windows, a `STATUS:` line at the end of every turn, and optionally a plain Claude tab that opens with a folder ("Toolkit: Open Claude here on startup"). Needs only the extension link and the status hooks.
2. **Coordinator**: open a project and a **coordinator** Claude session starts in an editor tab. It reports the SDD team recap, reads the project board and asks what is next. You tell it the goal; it creates the **worker** sessions the job needs, each in its own named tab with a written brief, and follows them through SendMessage. Workers that still have open work reopen with their conversation the next time you open the project. You can still type in any worker's tab.

| Part | Where |
|---|---|
| Status hooks (session events, `STATUS:` line instruction) and their installer | `status/` |
| `toolkit:coordinator` and `toolkit:worker` agents | `plugins/toolkit/agents/` |
| Start-up hook: runs SDD's team-mailbox pull for the coordinator only | `plugins/toolkit/hooks/` |
| VS Code extension: session view, plain Claude tab, coordinator and worker tabs | `vscode/` |

One project per coordinator; coordinating several projects is planned.

## Coordinator sessions

The extension starts every coordinator and worker session with `--plugin-dir <clone>/plugins/toolkit` and `--permission-mode auto` (sessions in the same mode exchange messages without approval prompts). `claude` must be on `PATH`, or set `claudeToolkit.claudePath`; `claudeToolkit.pluginDir` overrides the plugin folder. `claudeToolkit.workerLayout` chooses where worker tabs open: `beside` (default, the column next to the coordinator) or `tabs` (full-width tabs in the coordinator's column).

## Enable a project

Open the project folder and run "Toolkit: Enable coordinator in this folder". It records the folder as enabled on this machine (in the extension's own storage, never in the repository), creates `.coord/`, adds it to `.git/info/exclude` (never `.gitignore`), and opens the coordinator. From then on the coordinator opens whenever VS Code opens the folder; "Toolkit: Start coordinator" opens it again if you closed it. A repository that carries a `.coord/` folder starts nothing until you enable it yourself, and the extension's settings are machine-scoped, so a workspace cannot change which executable or plugin it runs.

### The board (`.coord/`)

| File | Written by | Contents |
|---|---|---|
| `team.json` | coordinator | `[{ "name", "role", "state": "active" \| "done" }]`; active workers reopen at start-up |
| `workers/<name>/brief.md` | coordinator | the worker's task |
| `workers/<name>/status.md` | worker | `State`, `Summary`, `Next` |
| `requests/<name>.json` | coordinator | `{ "name": "<name>" }`: asks the extension to open the worker; rejected requests leave `<name>.rejected.md` |
| `log.md` | coordinator | decisions, assignments and outcomes |
| `sessions/<session name>.id` | start-up hook | each worker's session ID, so its tab resumes exactly its own conversation, also when the coordinator requests a finished worker again |

Sessions are named `<project>-coordinator` and `<project>-<worker>` (the project folder name in lowercase, other characters as hyphens); tabs show the short name. Enabled projects need different folder names, or their sessions share names.

## Session status

The "Claude sessions" view (its own icon in the Activity Bar, the same in every window; drag it elsewhere once if you prefer) and the status-bar item show every interactive Claude Code session on this machine, toolkit or not. Clicking the status-bar item (`🔔 2 waiting`) shows the session waiting longest; `Ctrl+Alt+N` ("Toolkit: Next waiting session") cycles through the waiting sessions in urgency order; both reach tabs in other windows like a card click does.

| Colour | Status | Set by |
|---|---|---|
| red | waiting for permission / waiting for your answer | `PermissionRequest`; `AskUserQuestion`, or a turn ending with `STATUS: QUESTION` (coordinator and worker) or a final `?` |
| purple | possibly stuck | working with no event for `claudeToolkit.stuckMinutes` (default 15; read-only tools such as Read and Grep record no event) |
| blue | working in background | the turn ended while background tasks (a dev server, a long command) still run; the card shows how many |
| yellow | finished, needs review | any other end of turn |
| green | working | a prompt or a tool result |
| grey | idle | session started, no prompt yet |

Cards are grouped by project folder (each group shows how many of its sessions wait). Drag sessions within their project, and projects among projects, to arrange the view; your order is kept in every window and wins over urgency, while sessions and projects you never placed follow yours sorted by urgency (longest waiting first). "Move up" / "Move down" in a card's or project's context menu (also Shift+F10 from the keyboard) do the same without dragging. "Toolkit: Reset session order" returns to automatic sorting. Cards show the time in that status, the last tool used ("after Bash"; only finished tool calls are recorded) or the tool asking for permission, and the last line of the last message. Click a card to focus its tab, in any VS Code window: each window lists the session tabs it opened in `~/.agent-status/windows/<pid>.json`, and a click on a session held by another window brings that window to the front (by opening its folder) and asks it, through `~/.agent-status/focus/<pid>.json`, to show the tab. A card's tooltip says where its session runs; a session started by hand outside the toolkit's tabs only gets a message. Hide a card with its eye icon until the session's next event; closing a tab hides its card too. A session whose Claude process has ended (tab, terminal or window closed, crash) disappears from the view, hidden group included; sessions recorded before the hook stored process ids fall back to the 6-hour cleanup. Hidden cards are listed in the collapsed "Hidden" group at the bottom of the view, where the eye button shows one again; hiding is remembered across reloads.

The hooks are installed with `node <clone>/status/install.mjs` (see [INSTALL.md](INSTALL.md)); it backs up `~/.claude/settings.json` first and adds only its own entries, and `--uninstall` removes them. A small synchronous start-up hook (`status/turn-status-hook.mjs`) asks every interactive session to end each turn with `STATUS: QUESTION` or `STATUS: DONE`. "Toolkit: Open Claude here on startup" opens a plain `claude` tab (session `<project>-claude`, no agent, plugin or prompt) whenever the folder opens; "Toolkit: Stop opening Claude here" turns off both the plain tab and the coordinator for the folder.

The event hook (`status/status-hook.mjs`) runs asynchronously, so sessions never wait for it, and appends one line per event to `~/.agent-status/sessions/<session_id>.jsonl`; errors go to `~/.agent-status/hook.log`. It deletes a session's file at `SessionEnd` and leaves a `<session_id>.ended` marker so late background events cannot bring the session back (a new start or resume clears it), and, when a session starts, removes files and markers idle for more than 6 hours (`STALE_HOURS` at the top of the script). Headless sessions (`claude -p`, SDK, SDD's reviewer) are skipped by the observed but undocumented `CLAUDE_CODE_ENTRYPOINT=sdk-*` value; `tests/status-entrypoint.e2e.mjs` checks it against the installed CLI. A denied permission stays red until the turn ends, because Claude Code fires no event for a denial. To keep hooks light, no event is recorded after read-only tools (Read, Grep, Glob, LS, todo updates, tool search); if one of them asks for permission (for example a file outside the project), the card stays red after you grant it until the session's next command, edit or end of turn.

## Plugin delivery

The organization's managed Claude Code policy currently allows only the official Anthropic marketplace, so the plugin is loaded from the clone with `--plugin-dir` (the extension does it; by hand: `claude --plugin-dir <clone>/plugins/toolkit`). Update with `git pull`, then reload VS Code.

Once an admin allows the marketplace:

```
claude plugin marketplace add dserri/claude-toolkit
claude plugin install toolkit@claude-toolkit
```

and enable auto-update for `claude-toolkit` in `/plugin` → Marketplaces. The plugin declares no version, so every pushed commit is a release.

## Roll back

Delete the `dserri.claude-toolkit-0.0.1` junction and reload VS Code; remove a project's `.coord/` folder if you no longer want its board. Sessions started by hand work as before.

## Develop

```
node --test
node --test tests/coordinator.e2e.mjs tests/status-entrypoint.e2e.mjs
```

The first runs the unit, hook, installer and `claude plugin validate` tests (`claude` must be on `PATH`). The second starts real headless sessions with a model call. Tab behaviour and the session view in VS Code are verified by hand.
