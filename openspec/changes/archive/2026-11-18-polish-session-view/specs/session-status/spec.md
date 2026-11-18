# Spec Delta

## ADDED Requirements

### Requirement: Plain tab rename respects the developer

The plain tab SHALL be renamed only when the session running in its Claude process differs from the last session name applied to it and from the tab's own default session (`<project>-claude`, so a fresh tab stays `claude`), and SHALL NOT take `coordinator`, `claude` or the name of another open tab of the window.

#### Scenario: Manual name kept

- **WHEN** the developer renames the plain tab by hand while the same session keeps running
- **THEN** the tab keeps the developer's name

#### Scenario: New chat

- **WHEN** the developer then runs `/resume` and picks another chat
- **THEN** the tab takes the new chat's name

#### Scenario: Reserved or taken name

- **WHEN** the resumed chat is named `coordinator`, `claude` or like another open tab
- **THEN** the plain tab keeps its current name

### Requirement: Project folder on every platform

The hook SHALL take the project folder name as the last segment of the project path split on both `/` and `\`, so the same result holds on Windows, macOS and Linux.

#### Scenario: Windows path on macOS or Linux

- **WHEN** the hook receives `C:\repos\rehlko-portal` on a POSIX system
- **THEN** the folder name is `rehlko-portal`

### Requirement: Order pruning keeps unreadable sessions

Pruning the stored order SHALL treat sessions whose files are present but unreadable as existing.

#### Scenario: Briefly unreadable file

- **WHEN** the developer reorders a project while a placed hand-started session's file cannot be read
- **THEN** that session keeps its placement
