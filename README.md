# claude-toolkit

Personal Claude Code plugins, laid out as a private plugin marketplace. A proof of concept: it is compatible with the team-shared SDD skill but entirely separate from it, and never changes it. Every toolkit agent carries the `toolkit:` prefix.

## What it does

Open a project in VS Code and a **coordinator** Claude session starts in an editor tab. It reports the SDD team recap, reads the project board and asks what is next. You tell it the goal; it creates the **worker** sessions the job needs, each in its own named tab with a written brief, and follows them through SendMessage. Workers that still have open work reopen with their conversation the next time you open the project. You can still type in any worker's tab.

| Part | Where |
|---|---|
| `toolkit:coordinator` and `toolkit:worker` agents | `plugins/toolkit/agents/` |
| Start-up hook: runs SDD's team-mailbox pull for the coordinator only | `plugins/toolkit/hooks/` |
| VS Code extension: starts the coordinator, reopens active workers, opens requested workers | `vscode/` |

One project at a time; coordinating several projects is planned.

## Set up (once per machine)

Link the extension into VS Code, then reload VS Code (Command Palette → "Developer: Reload Window"):

```
New-Item -ItemType Junction -Path "$env:USERPROFILE\.vscode\extensions\dserri.claude-toolkit-0.0.1" -Target "<clone>\vscode"
```

The extension starts every session with `--plugin-dir <clone>/plugins/toolkit` and `--permission-mode auto` (sessions in the same mode exchange messages without approval prompts). `claude` must be on `PATH`, or set `claudeToolkit.claudePath`; `claudeToolkit.pluginDir` overrides the plugin folder.

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
node --test tests/coordinator.e2e.mjs
```

The first runs the unit, hook and `claude plugin validate` tests (`claude` must be on `PATH`). The second starts a real coordinator session with a model call. Tab behaviour in VS Code is verified by hand.
