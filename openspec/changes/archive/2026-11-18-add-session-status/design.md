# Design

## Context

See proposal.md. Checked on this machine (Claude Code 2.1.326, headless probe with a temporary `--settings` hook): every event carries `session_id`, `cwd`, `prompt_id`, `permission_mode`; `session_title` arrives only on SessionStart and UserPromptSubmit; Stop carries `last_assistant_message`; PermissionRequest fires immediately (the `permission_prompt` notification only after about 6 s); PostToolUse carries `duration_ms`; the hook process sees `CLAUDE_CODE_ENTRYPOINT=sdk-cli` in headless sessions and `cli` in interactive ones (undocumented). A Node process start costs about 190 ms here. Documented: `"async": true` runs a command hook in the background without delaying the session; no event fires when the developer denies a permission in manual mode; hooks run only after workspace trust. The developer's sessions are CLI sessions in editor terminal tabs opened by our extension, so Anthropic's `vscode://anthropic.claude-code/open` link does not apply.

## Goals / Non-Goals

**Goals:** correct, fast-to-read status for every interactive session; zero delay for sessions; no server or background process.

**Non-Goals:** the coordinator reading the state (later); focusing tabs in another VS Code window; the supervisor; a browser page.

## Decisions

- **Append-only event log per session.** Asynchronous hooks are separate processes and can finish out of order, and two of them can update the same session at once. Instead of read-modify-write of one state file, the hook appends one JSON line per event to `sessions/<session_id>.jsonl` (`{ t, event, promptId, tool, title, cwd, last }`); the status is a pure fold of those lines in the extension. Ordering uses `prompt_id`: a Stop closes its prompt, events of a closed or earlier prompt are ignored, and the line time orders the rest. On UserPromptSubmit the hook rewrites the file (temporary file and rename) to the session's first line plus the new event, so files stay small; a late line from the previous turn appended meanwhile is ignored by the fold.
- **Only the needed events:** SessionStart, UserPromptSubmit, PreToolUse with matcher `AskUserQuestion`, PermissionRequest, PostToolUse, PostToolUseFailure, Stop, SessionEnd; all `"async": true`. No Notification (PermissionRequest is earlier and deterministic) and no PreToolUse on every tool (cost). A denied permission leaves red until the turn's Stop, since no denial event exists.
- **Headless sessions skipped** when `CLAUDE_CODE_ENTRYPOINT` starts with `sdk`; this covers SDD's reviewer and our end-to-end test. Undocumented, so a test pins the rule and the README names it.
- **Name:** `session_title` from SessionStart or UserPromptSubmit, else the folder name of `cwd`.
- **Last message:** the last non-empty line of `last_assistant_message`, without a `STATUS:` line, cut to 200 characters. `STATUS: QUESTION` / `STATUS: DONE` decides question versus finished; without it, a final `?` means question.
- **Hook script lives in the clone** (`status/status-hook.mjs`), outside the plugin, because it must run for every session, not only plugin-loaded ones. `status/install.mjs` registers `node "<clone>/status/status-hook.mjs"` in `~/.claude/settings.json` after a timestamped backup, identifies its own entries by that command, and `--uninstall` removes only them.
- **View in the extension:** a TreeView "Claude sessions" in the Explorer and a status-bar item ("2 waiting"), refreshed by a file watcher on `~/.agent-status/sessions/` and a 15-second timer for the elapsed times. Pure logic (fold, status, urgency sort, labels) goes in `vscode/status-core.js` with tests; the glue in `extension.js`. Colours use VS Code theme colours on codicons. Clicking focuses the tab when the session name matches a tab this window opened (coordinator `<prefix>-coordinator`, worker `<prefix>-<name>`); otherwise the card says where the session is. Hiding is kept in memory, keyed by the session's latest event time.
- **Thresholds** `claudeToolkit.stuckMinutes` (10) and, for the hook, `STALE_HOURS` at the top of the script (6); the hook removes stale files only on SessionStart, keeping per-event work minimal.
- **Status line only in our agents**, appended to the coordinator and worker prompts; SDD and other sessions are untouched.

- **Last tool, not running tool:** only finished tool calls are recorded (PostToolUse), so working and stuck cards say "after <tool>". Recording every PreToolUse would show the running tool but double the background Node processes per tool call; rejected for cost. A permission card names the tool asking, which is exact.

## Risks / Trade-offs

- [Compaction at a new prompt reads the first line, writes a temporary file and renames it; a line appended by another hook process in those milliseconds is lost] → accepted: the window is milliseconds at the start of a turn and the next event of the turn restores the status; locking would add a mechanism for a cosmetic gap.

- [`CLAUDE_CODE_ENTRYPOINT` is undocumented] → pinned by a test against the installed CLI; if it disappears, headless sessions show up as cards (noise, not breakage).
- [A denied permission stays red until the turn ends] → no event exists for it; documented.
- [Async hook processes cost CPU on every tool call (about 190 ms each, in the background)] → only PostToolUse fires per tool call.
- [Each VS Code window can focus only its own tabs] → the card says so; the supervisor's multi-window view is a later concern.
- [Editing user settings] → backup first, own entries only, idempotent, uninstall.

## Migration Plan

1. `node status/install.mjs`, reload VS Code. 2. Rollback: `node status/install.mjs --uninstall` (or restore the backup) and delete `~/.agent-status/`.
