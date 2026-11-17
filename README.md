# claude-toolkit

Personal Claude Code plugins, delivered as a private plugin marketplace. It sits on top of the team-shared SDD skill and never changes it: SDD keeps its own installer, and every toolkit skill carries the `toolkit:` prefix.

## Contents

| Plugin | Skill | Use |
|---|---|---|
| `toolkit` | `/toolkit:create-coordinator <coordinator> <project…>` | Opens Windows Terminal with a coordinator session and one agent per project, wired together with SendMessage and a file board (`.coord`). Developer-invoked only. |

## Install

Git must already reach `github.com/dserri/claude-toolkit` (an SSH key or a stored HTTPS credential; Claude Code has no token of its own).

```
claude plugin marketplace add dserri/claude-toolkit
claude plugin install toolkit@claude-toolkit
```

Then enable auto-update for `claude-toolkit` in `/plugin` → Marketplaces. The plugin declares no version, so every pushed commit is a release; sessions pick it up at the next start or after `/reload-plugins`.

## Update by hand

```
claude plugin marketplace update claude-toolkit
claude plugin update toolkit@claude-toolkit
```

## Roll back

```
claude plugin uninstall toolkit@claude-toolkit
```

To return to the pre-marketplace `create-coordinator`, link `~/.claude/skills/create-coordinator` to `~/.create-coordinator/current/create-coordinator` again.

## Develop

```
node --test
claude plugin validate .
```

Load the working copy without installing it: `claude --plugin-dir plugins/toolkit`.
