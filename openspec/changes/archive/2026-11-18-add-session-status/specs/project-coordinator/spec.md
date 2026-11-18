# Spec Delta

## ADDED Requirements

### Requirement: Turn status line

The coordinator and worker agents SHALL end every turn with a final line `STATUS: QUESTION` when they need the developer's answer, and `STATUS: DONE` otherwise.

#### Scenario: Agent asks the developer

- **WHEN** a coordinator or worker ends its turn with a question for the developer
- **THEN** its last line is `STATUS: QUESTION`

#### Scenario: Agent finishes a turn

- **WHEN** a coordinator or worker ends its turn without needing the developer
- **THEN** its last line is `STATUS: DONE`
