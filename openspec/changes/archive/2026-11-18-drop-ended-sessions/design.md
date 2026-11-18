# Design

## Context

Observed on this machine: of 23 session files, the 18 without a Claude process id were all killed without SessionEnd (tabs and windows closed); the 5 with one run. The view already has a process liveness check for window registry entries.

## Decisions

- **Liveness in the view, not the hook:** `status.dropEnded(sessions, isAlive)` keeps sessions without `pid` and sessions whose pid is alive; applied right after reading, before the per-title and per-process filters and the hidden split, so ended sessions leave every group. Files stay until the hook's 6-hour cleanup; reading them is cheap.
- **Order pruning on write:** when a reorder stores a project's keys, `id:` keys whose session id is not among the existing sessions are removed (`status.pruneOrderKeys`); titled names are kept.
- **Pid reuse:** a new process reusing an ended session's pid would keep that card until the 6-hour rule; accepted, rare.
