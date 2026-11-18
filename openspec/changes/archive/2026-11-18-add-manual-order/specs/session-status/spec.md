# Spec Delta

## ADDED Requirements

### Requirement: Manual order

The developer SHALL be able to drag a session onto another session of the same project to place it before that session, or onto its own project to place it last, and drag a project onto another project to place it before. Drops across projects or onto the hidden group SHALL change nothing. The resulting order SHALL be stored per machine, shared by all windows, and SHALL take precedence over urgency; sessions and projects never placed SHALL follow the placed ones in urgency order. "Toolkit: Reset session order" SHALL clear it. "Move up" and "Move down" in the context menu of a session or project SHALL make the same moves without dragging. A reorder SHALL keep the placement of items not currently displayed, and sessions without a title SHALL be ordered individually.

#### Scenario: Reorder sessions

- **WHEN** the developer drags `portal-docs` onto `portal-tester` in the `rehlko-portal` group
- **THEN** `portal-docs` is shown just before `portal-tester` and stays there when statuses change

#### Scenario: Reorder projects

- **WHEN** the developer drags the `api` project onto `rehlko-portal`
- **THEN** `api` is shown before `rehlko-portal` in every window

#### Scenario: Cross-project drop

- **WHEN** the developer drops a `rehlko-portal` session onto an `api` session
- **THEN** nothing moves

#### Scenario: New session

- **WHEN** a new session starts in a project whose sessions were placed by hand
- **THEN** it appears after the placed sessions

#### Scenario: Reset

- **WHEN** the developer runs "Toolkit: Reset session order"
- **THEN** projects and sessions are sorted by urgency again

### Requirement: Robust hidden state

Storage writes for hidden state and order SHALL report a failure to the developer instead of failing silently. A session file that cannot be read or holds no events SHALL NOT be treated as new activity. The hidden group SHALL be labelled "Hidden (n)".

#### Scenario: Unreadable file

- **WHEN** a hidden session's file cannot be read during a refresh
- **THEN** it stays hidden
