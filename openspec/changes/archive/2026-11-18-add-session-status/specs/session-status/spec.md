# Spec Delta

## Purpose

Shows the developer the live state of every interactive Claude Code session, derived only from hook events, so sessions waiting for them are visible at a glance and one click away.

## ADDED Requirements

### Requirement: Recording session events

A user-level hook SHALL record, for every interactive session, the events SessionStart, UserPromptSubmit, PreToolUse for `AskUserQuestion`, PermissionRequest, PostToolUse, PostToolUseFailure, Stop and SessionEnd in `~/.agent-status/sessions/<session_id>.jsonl`. It SHALL run asynchronously, print nothing, always exit 0, log its own errors to `~/.agent-status/hook.log`, and skip headless sessions.

#### Scenario: Interactive session

- **WHEN** an interactive session starts, receives a prompt and uses a tool
- **THEN** its file holds those events with their time, prompt id, tool name and the session name from `session_title` (or the folder name)

#### Scenario: Headless session

- **WHEN** a session started with `claude -p` or the SDK fires the same events
- **THEN** nothing is recorded

#### Scenario: Hook failure

- **WHEN** the hook cannot write or receives unreadable input
- **THEN** it exits 0 without output and appends one line to its log

#### Scenario: Session ends

- **WHEN** SessionEnd fires
- **THEN** the session's file is deleted

### Requirement: Status rules

The status SHALL be computed from the session's events: idle after SessionStart; working after UserPromptSubmit, PostToolUse or PostToolUseFailure; waiting for permission after PermissionRequest; waiting for an answer after PreToolUse of `AskUserQuestion`, or after Stop when the last message's final line is `STATUS: QUESTION` or, without a status line, the message ends with a question mark; finished after any other Stop; possibly stuck when working without events for longer than a configurable threshold (default 10 minutes). Events of a turn that has already stopped, or of an earlier turn, SHALL NOT change the status.

#### Scenario: Out-of-order events

- **WHEN** a PostToolUse of a turn is recorded after that turn's Stop
- **THEN** the status stays as the Stop set it

#### Scenario: Permission answered

- **WHEN** the developer grants a pending permission and the tool runs
- **THEN** the status returns from waiting for permission to working

#### Scenario: Long tool run

- **WHEN** a session records no event for longer than the threshold while working
- **THEN** it shows as possibly stuck, with the last tool used ("after <tool>") and the time since its last event

### Requirement: Sessions view

The VS Code extension SHALL show a "Claude sessions" view and a status-bar count of sessions waiting for the developer. Each card SHALL show the session name, the status with its colour (red waiting, yellow finished, green working, grey idle, purple possibly stuck), the time in that status, the last line of the last message, the tool asking for permission while waiting for one, and, while working or possibly stuck, the last tool used, labelled "after <tool>" because only finished tool calls are recorded. Cards SHALL be grouped by project folder, each group showing how many of its sessions wait and the colour of its most urgent session; groups SHALL be sorted by their most urgent session, and cards inside a group with waiting sessions first, longest-waiting first.

#### Scenario: Developer is needed

- **WHEN** one session waits for permission and two are working
- **THEN** the waiting session is the first card of its group, coloured red, its group is first, and the status bar shows one waiting

#### Scenario: Several projects

- **WHEN** sessions run in `rehlko-portal` and `api`
- **THEN** the view shows one group per project, each holding only its own sessions

#### Scenario: Focus a tab

- **WHEN** the developer clicks a card whose session runs in a tab of this window opened by the extension
- **THEN** that tab is shown and focused; for other sessions the card says the session is in another window or was started by hand

#### Scenario: Tab closed

- **WHEN** the developer closes a tab the extension opened, so its session ends without SessionEnd
- **THEN** that session's card disappears from this window until the session records a new event

#### Scenario: Hide a card

- **WHEN** the developer hides a card
- **THEN** it disappears from this view until the session records a new event

### Requirement: Stale sessions

Session files with no event for longer than a configurable time (default 6 hours) SHALL be removed by the hook when a session starts, and the view SHALL not show them.

#### Scenario: Crashed session

- **WHEN** a session was killed without SessionEnd seven hours ago and another session starts
- **THEN** the old session's file is removed and its card is gone

### Requirement: Hook installation

An installer SHALL back up `~/.claude/settings.json` with a timestamp, add the toolkit's asynchronous hook entries pointing at the clone without changing existing entries, do nothing when they are already present, and remove only its own entries on uninstall.

#### Scenario: Existing hooks kept

- **WHEN** the settings already hold a Stop hook and other keys
- **THEN** after install they are unchanged, a backup exists, and the toolkit entries are added once
