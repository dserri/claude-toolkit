# Spec Delta

## ADDED Requirements

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
