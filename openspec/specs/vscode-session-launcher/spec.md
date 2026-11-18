# vscode-session-launcher Specification

## Purpose
Opens the coordinator and its worker sessions as named Claude Code tabs in VS Code, so opening a project is the only step needed to resume work.

## Requirements

### Requirement: Enabling a project

The extension SHALL provide a command that enables the open folder: it records the folder as enabled in the extension's storage on this machine, creates `.coord/`, adds `.coord/` to `.git/info/exclude` when the folder is a Git repository, and starts the coordinator. A folder SHALL start automatically only when it is recorded as enabled on this machine and has `.coord/`; nothing in the repository alone enables it. The extension's settings SHALL be machine-scoped, so a workspace cannot override the Claude executable or the plugin folder.

#### Scenario: Enable a project

- **WHEN** the developer runs "Toolkit: Enable coordinator in this folder"
- **THEN** the folder is recorded as enabled, `.coord/` exists, `.git/info/exclude` lists it once, and the coordinator tab opens

#### Scenario: Folder not enabled

- **WHEN** VS Code opens a folder without `.coord/`, or one never enabled on this machine
- **THEN** the extension opens nothing

#### Scenario: Cloned repository carrying a board

- **WHEN** a repository with a committed `.coord/` folder and a `.vscode/settings.json` setting `claudeToolkit.claudePath` is opened for the first time
- **THEN** no session starts and the workspace value of `claudeToolkit.claudePath` is ignored

### Requirement: Automatic start

When VS Code opens an enabled folder, the extension SHALL open the coordinator in an editor tab named `coordinator`, as a new session with the coordinator agent, and reopen every worker the team list marks active by resuming its session in a tab named after it.

#### Scenario: Morning start

- **WHEN** the developer opens an enabled project with two active workers and one done worker
- **THEN** three tabs open: `coordinator` and the two active workers, and the done worker stays closed

#### Scenario: Worker with a recorded session

- **WHEN** VS Code reopens a project with an active worker whose session is recorded on the board
- **THEN** the worker's tab resumes exactly that session, without a session picker

#### Scenario: Already open

- **WHEN** the coordinator or a worker tab of this window is already open
- **THEN** the extension does not open a second one

### Requirement: Worker requests

The extension SHALL open a worker when the coordinator writes a request file on the board, and SHALL reject a request whose worker name is invalid, already open or has no brief, leaving a rejection note for the coordinator.

#### Scenario: Valid request

- **WHEN** the coordinator writes a request for worker `tester` with a brief
- **THEN** a tab named `tester` opens with a new worker session named `<project>-tester` that starts by reading its brief

#### Scenario: Request for a worker that already had a session

- **WHEN** the coordinator requests a worker whose session is recorded on the board, after appending a section to its brief
- **THEN** the tab resumes that session, with its earlier conversation, and tells it to read the newest section of its brief; no second session with that name is created

#### Scenario: Request still being written

- **WHEN** VS Code reports a request file whose content is not yet complete JSON
- **THEN** the extension leaves it in place and handles it when the write completes; at start-up, an unreadable leftover request is rejected

#### Scenario: Hostile request

- **WHEN** a request carries a name with path separators, quotes, spaces or shell metacharacters, or a brief path outside `.coord/`
- **THEN** no terminal opens and the request is answered with a rejection note

### Requirement: Session command

Every session SHALL start Claude Code directly, without a shell, with `--plugin-dir` pointing at this repository's plugin, `--permission-mode auto`, `--name` and the role's `--agent`; the worker's opening prompt SHALL be a fixed instruction to read its brief, never text taken from a request.

#### Scenario: No shell interpretation

- **WHEN** any session is opened
- **THEN** the program and its arguments are passed as a list to the terminal, so no character in them is interpreted by a shell

### Requirement: Worker layout

A machine-scoped setting `claudeToolkit.workerLayout` SHALL choose where worker tabs open: `beside` (default) opens them in the column next to the coordinator, `tabs` opens them as tabs in the coordinator's column.

#### Scenario: Default layout

- **WHEN** the setting is not changed
- **THEN** workers open beside the coordinator, as before

#### Scenario: Tabs layout

- **WHEN** the setting is `tabs` and the coordinator requests a worker
- **THEN** the worker opens as a full-width tab in the coordinator's column without taking focus
