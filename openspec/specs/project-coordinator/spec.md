# project-coordinator Specification

## Purpose
Lets the developer run a project through one coordinator Claude session that creates, briefs and follows worker sessions, keeping shared state on a file board in the project.

## Requirements

### Requirement: Coordinator role

The plugin SHALL provide a `coordinator` agent that talks with the developer, plans the work, creates and briefs workers, follows them through SendMessage and keeps the board current. It SHALL NOT edit project files outside `.coord/`.

#### Scenario: Developer gives a goal

- **WHEN** the developer tells the coordinator what is needed
- **THEN** the coordinator decides the workers needed, writes each brief and a worker request on the board without waiting for approval, and tells the developer which workers it created and why

#### Scenario: Coordinator stays out of the code

- **WHEN** a goal requires a code change
- **THEN** the coordinator assigns it to a worker instead of editing project files itself

### Requirement: Worker role

The plugin SHALL provide a `worker` agent that reads its brief, does the task with the project's normal workflow (SDD included), records its status on the board and reports to the coordinator by SendMessage when done or blocked.

#### Scenario: Done worker gets new work

- **WHEN** the coordinator gives new work to a worker marked done
- **THEN** it appends a dated section to that worker's brief, sets it active and requests it, so the worker's existing session continues instead of a new one starting

#### Scenario: Worker finishes

- **WHEN** a worker completes its task
- **THEN** it updates its status file to done and sends the coordinator a short message naming the result

#### Scenario: Developer talks to a worker directly

- **WHEN** the developer types in a worker's tab
- **THEN** the worker follows the developer, and tells the coordinator only when that changes its task, scope or state

### Requirement: Project board

Shared state SHALL live in `<project>/.coord/`: the team list with each worker's name, role and state, one folder per worker with its brief and status, and the coordinator's log. `.coord/` SHALL be excluded from Git through `.git/info/exclude`, never `.gitignore`.

#### Scenario: Board survives restarts

- **WHEN** VS Code is closed and the project is opened the next day
- **THEN** the team list, briefs, statuses and log are as they were left

#### Scenario: Board stays out of Git

- **WHEN** a project is enabled
- **THEN** `git status` shows no `.coord/` file and no tracked file is modified

### Requirement: Session names

Session names SHALL be `<project>-coordinator` and `<project>-<worker>`, where `<project>` is the project folder name in lowercase with other characters as hyphens and `<worker>` is lowercase letters, digits and hyphens, at most 40 characters, so they are unique on the machine as long as enabled projects have different folder names. Tabs show the short name.

#### Scenario: Two projects open at once

- **WHEN** two enabled projects each have a coordinator and a worker named `tester`
- **THEN** their sessions are reachable separately by SendMessage

### Requirement: Worker session record

When a worker session starts or is resumed in a project that has `.coord/`, the plugin SHALL record its session ID in `.coord/sessions/<session name>.id`, replacing any earlier record for that name. Session names that do not match the session name pattern SHALL be ignored.

#### Scenario: Worker starts or resumes

- **WHEN** a session running as the worker agent with session name `<project>-tester` starts or is resumed in an enabled project
- **THEN** `.coord/sessions/<project>-tester.id` holds that session's ID

#### Scenario: Unsafe or unrelated sessions

- **WHEN** the session is not a worker, the project has no `.coord/`, or the session name contains characters outside lowercase letters, digits and hyphens
- **THEN** no record is written

### Requirement: Startup team recap

When a coordinator session starts (not when one is resumed), the plugin SHALL run SDD's documented team-mailbox pull for the project and add its recap to the coordinator's context; for other sessions it SHALL do nothing. A failed pull SHALL be reported in one line without stopping the session.

#### Scenario: Project with a team mailbox

- **WHEN** the coordinator starts in a project whose SDD pull returns a recap
- **THEN** the recap is in the coordinator's context and the coordinator reports it first, without running the pull again

#### Scenario: Worker or plain session

- **WHEN** a worker or a session without the coordinator agent starts
- **THEN** the hook runs no pull and adds nothing

#### Scenario: SDD missing or failing

- **WHEN** the SDD script is absent or the pull fails
- **THEN** the coordinator's context says the pull failed and why, in one line, and the session continues
