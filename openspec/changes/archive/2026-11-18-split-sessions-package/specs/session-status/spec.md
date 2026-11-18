# Spec Delta

## ADDED Requirements

### Requirement: Turn status instruction for every session

The status installer SHALL register a synchronous SessionStart hook that adds to every interactive session's context the instruction to end each turn with a final line `STATUS: QUESTION` when the developer's answer is needed and `STATUS: DONE` otherwise. Headless sessions SHALL receive nothing. Uninstall SHALL remove it with the other status hooks.

#### Scenario: Interactive session

- **WHEN** an interactive session starts, resumes, or is cleared or compacted, with the status hooks installed
- **THEN** its context holds the status-line instruction

#### Scenario: Headless session

- **WHEN** a `claude -p` or SDK session starts
- **THEN** the hook prints nothing and exits 0
