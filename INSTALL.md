# Installing claude-toolkit

Instructions for a developer, or for Claude Code acting for one. Follow the steps in order, run the verification at the end of each step, and stop and report if a step fails. Do not change anything not listed here.

There are two parts. Install **Part 1** for the session view; add **Part 2** only if you want the coordinator workflow.

| Part | What you get | Needs |
|---|---|---|
| 1. Claude sessions | "Claude sessions" view with colour-coded status of every Claude session, status-bar count, `Ctrl+Alt+N` to jump to waiting sessions, click to focus a session in any VS Code window, `STATUS:` line in every session, optional automatic Claude tab when a folder opens | VS Code extension link + status hooks |
| 2. Coordinator | A coordinator session per project that creates and briefs worker sessions | Part 1 + enabling the coordinator per folder |

## Prerequisites

Check each one and stop if it is missing:

- VS Code: `code --version`
- Claude Code CLI on `PATH`: `claude --version`
- Node.js 20 or newer: `node --version`
- Git, with read access to `github.com/dserri/claude-toolkit` (private: ask its owner for access): `git ls-remote https://github.com/dserri/claude-toolkit.git`

## Part 1: Claude sessions

### 1.1 Clone

Clone into a stable folder; the hooks and the extension point at it, so do not move it afterwards. Below, `<clone>` is that absolute path.

```
git clone https://github.com/dserri/claude-toolkit.git <clone>
```

Verify: `<clone>/vscode/package.json` and `<clone>/status/install.mjs` exist.

### 1.2 Link the VS Code extension

Windows (PowerShell):

```
New-Item -ItemType Junction -Path "$env:USERPROFILE\.vscode\extensions\dserri.claude-toolkit-0.0.1" -Target "<clone>\vscode"
```

macOS / Linux:

```
ln -s "<clone>/vscode" ~/.vscode/extensions/dserri.claude-toolkit-0.0.1
```

Verify: `code --list-extensions --show-versions` lists `dserri.claude-toolkit@0.0.1`.

### 1.3 Install the status hooks

```
node <clone>/status/install.mjs
```

It backs up `~/.claude/settings.json` (printing the backup path) and adds only its own hook entries; existing settings and hooks stay unchanged. Running it again changes nothing.

Verify: `~/.claude/settings.json` has entries running `status-hook.mjs` (marked `"async": true`) for `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `SessionEnd`, and one `SessionStart` entry running `turn-status-hook.mjs`.

### 1.4 Reload VS Code

In every open VS Code window: Command Palette → "Developer: Reload Window". Claude sessions already running are not tracked until restarted; new ones are.

Verify, with the developer:
- The Activity Bar (left icon strip) shows a "Claude sessions" icon (three stacked bars). To place it under the Explorer, drag it there once; VS Code remembers the order for all windows.
- The status bar shows `none waiting` or `N waiting`.
- A new Claude session (`claude` in a terminal) appears as a card within seconds and ends its turns with `STATUS: DONE` or `STATUS: QUESTION`.

### 1.5 Optional: open Claude automatically in a folder

Open the project folder, then Command Palette → "Toolkit: Open Claude here on startup". A `claude` tab opens now and every time VS Code opens that folder. To resume an earlier conversation in it, use `/resume`. "Toolkit: Stop opening Claude here" turns it off.

## Part 2: Coordinator (optional)

Requires Part 1. In the project folder: Command Palette → "Toolkit: Enable coordinator in this folder". It records the folder on this machine, creates `.coord/` (excluded from Git through `.git/info/exclude`) and opens a `coordinator` tab. From then on the coordinator opens with the folder; tell it the goal and it creates worker tabs. See README.md for how it works. Sessions load the toolkit plugin from the clone automatically; no plugin install is needed.

## Settings

All machine-scoped, under `claudeToolkit.` in VS Code settings:

| Setting | Default | Meaning |
|---|---|---|
| `workerLayout` | `beside` | Coordinator workers open beside the coordinator, or `tabs` for full-width tabs |
| `stuckMinutes` | `10` | Minutes without events before a working session shows as possibly stuck |
| `claudePath` | `claude` from `PATH` | Claude Code executable |
| `pluginDir` | `<clone>/plugins/toolkit` | Toolkit plugin folder (coordinator only) |

## Updating

```
git -C <clone> pull
node <clone>/status/install.mjs
```

Then reload VS Code windows.

## Uninstalling

```
node <clone>/status/install.mjs --uninstall
```

Then delete the extension link (`~/.vscode/extensions/dserri.claude-toolkit-0.0.1`), reload VS Code, and optionally delete `~/.agent-status/`. "Toolkit: Stop opening Claude here" before uninstalling removes a folder's automatic start.

## Troubleshooting

- **No cards appear:** the session was started before the hooks were installed (restart it), or the folder's workspace trust was not accepted (Claude Code runs hooks only in trusted folders). Hook errors are logged to `~/.agent-status/hook.log`.
- **Headless sessions** (`claude -p`, SDK, SDD's reviewer) are skipped on purpose.
- **Windows Terminal windows flashing during SDD checks** come from SDD 0.3.0-rc.47 and later (check commands started without a hidden window), not from this toolkit; a fix has been requested from the SDD maintainer.
