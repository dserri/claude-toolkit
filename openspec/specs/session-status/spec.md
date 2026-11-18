# session-status Specification

## Purpose
Shows the developer the live state of every interactive Claude Code session, derived only from hook events, so sessions waiting for them are visible at a glance and one click away.

## Requirements

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

### Requirement: Window registry

Each VS Code window running the extension SHALL publish `~/.agent-status/windows/<process id>.json` with its folder and the session names of the tabs it opened, update it whenever such a tab opens or closes, and delete it when the window closes. Entries of windows whose process no longer runs SHALL be ignored.

#### Scenario: Two windows

- **WHEN** one window holds `rehlko-portal-coordinator` and another holds `api-coordinator`
- **THEN** each window's file lists only its own sessions and folder

#### Scenario: Crashed window

- **WHEN** a window's file remains after its process has ended
- **THEN** no window treats its sessions as focusable there

### Requirement: Cross-window focus

Clicking a card whose session is held by another window SHALL bring that window to the front by opening its folder and SHALL ask it, through `~/.agent-status/focus/<process id>.json`, to show the tab; the receiving window SHALL show the tab and delete the request. Requests SHALL carry only a session name, which the receiver matches against its own tabs.

#### Scenario: Session in another window

- **WHEN** the developer clicks the red card of `api-tester`, held by the `api` window
- **THEN** the `api` window comes to the front with the `tester` tab shown

#### Scenario: Session not in any window

- **WHEN** the developer clicks the card of a session started by hand outside the extension's tabs
- **THEN** no window opens and a message says the session is not a toolkit tab

### Requirement: Card location

Each card's tooltip SHALL say where its session runs: in this window, in another window (by folder), or not in a toolkit tab.

#### Scenario: Tooltip

- **WHEN** the developer hovers the card of a session held by the `api` window
- **THEN** the tooltip names the `api` window

### Requirement: One card per session name, in its project

A card's project SHALL be the first project folder recorded for the session, taken from its project root (`CLAUDE_PROJECT_DIR`, else the working folder), so moving into a subfolder does not move the card. When several sessions carry the same session title, only the one with the latest event SHALL be shown; sessions without a title are never merged.

#### Scenario: Agent changes folder

- **WHEN** a coordinator started in `rehlko-portal` runs commands inside `.coord/`
- **THEN** its card stays in the `rehlko-portal` group

#### Scenario: Restarted coordinator

- **WHEN** an earlier `rehlko-portal-coordinator` session was killed by a window reload and a new one started
- **THEN** only the new session's card is shown

### Requirement: Ended sessions stay ended

After SessionEnd, later events of the same session SHALL NOT recreate its card; the ended marker SHALL be removed with the other stale files.

#### Scenario: Late event after the end

- **WHEN** a Stop of a session is recorded after its SessionEnd
- **THEN** no card for that session appears

### Requirement: Jump to the waiting session

Clicking the status-bar item SHALL focus the most urgent waiting session (longest waiting first), in this or another window as a card click does; with no session waiting it SHALL open the sessions view.

#### Scenario: Sessions waiting

- **WHEN** two sessions wait and the developer clicks the status-bar item
- **THEN** the one waiting longest is focused

#### Scenario: Nothing waiting

- **WHEN** no session waits and the developer clicks the status-bar item
- **THEN** the sessions view opens

### Requirement: Next waiting session

A command "Toolkit: Next waiting session", bound by default to `Ctrl+Alt+N`, SHALL focus the waiting sessions one after another in urgency order, starting again from the first after the last; with none waiting it SHALL show a short message.

#### Scenario: Cycling

- **WHEN** three sessions wait and the developer presses the shortcut three times
- **THEN** each of the three is focused once, in urgency order

### Requirement: Fixed view placement

"Claude sessions" SHALL live in its own Activity Bar container, so it appears in the same place in every window.

#### Scenario: Two windows

- **WHEN** the developer switches between two VS Code windows
- **THEN** both show the "Claude sessions" container under the same Activity Bar icon

### Requirement: Safe registry and focus files

Window registry files SHALL be removed by the name of the file read, including unreadable ones; registry files and focus requests SHALL be written to a temporary file and renamed into place, so a reader never sees a partial file.

#### Scenario: Unreadable registry file

- **WHEN** a window file cannot be parsed
- **THEN** the next reader deletes that file and no other

### Requirement: Turn status instruction for every session

The status installer SHALL register a synchronous SessionStart hook that adds to every interactive session's context the instruction to end each turn with a final line `STATUS: QUESTION` when the developer's answer is needed and `STATUS: DONE` otherwise. Headless sessions SHALL receive nothing. Uninstall SHALL remove it with the other status hooks.

#### Scenario: Interactive session

- **WHEN** an interactive session starts, resumes, or is cleared or compacted, with the status hooks installed
- **THEN** its context holds the status-line instruction

#### Scenario: Headless session

- **WHEN** a `claude -p` or SDK session starts
- **THEN** the hook prints nothing and exits 0

### Requirement: Hidden group

Sessions hidden by the developer or by closing their tab SHALL be listed in a "Hidden" group after all project groups, collapsed by default, labelled with their count and ordered by latest event first, and SHALL NOT count in the status-bar waiting count. Each entry SHALL offer "Show again", which returns the session to its project group. The group SHALL not appear when nothing is hidden.

#### Scenario: Mistaken hide

- **WHEN** the developer hides a card by mistake
- **THEN** it appears in the collapsed "Hidden (1)" group, and "Show again" puts it back in its project group

#### Scenario: Closed tab

- **WHEN** the developer closes a session's tab
- **THEN** its card leaves the project group and is listed only in the collapsed hidden group

#### Scenario: New activity

- **WHEN** a hidden session records a new event
- **THEN** it returns to its project group by itself

### Requirement: Persistent hiding

Hidden sessions SHALL be stored in the extension's storage on this machine, so a window reload keeps them hidden; entries of sessions that no longer have a session file, or that recorded a newer event, SHALL be dropped.

#### Scenario: Reload

- **WHEN** the developer hides a card and reloads the window
- **THEN** the card stays in the hidden group
