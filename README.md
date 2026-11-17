# claude-toolkit

Personal Claude Code plugins, laid out as a private plugin marketplace. A proof of concept: it is compatible with the team-shared SDD skill but entirely separate from it, and never changes it. Every toolkit skill and agent carries the `toolkit:` prefix.

## Contents

| Plugin | Status |
|---|---|
| `toolkit` | Skeleton. The single-project coordinator (a coordinator session that creates, names and briefs worker sessions, and starts with VS Code) is planned next. |

## Use it locally

The organization's managed Claude Code policy currently allows only the official Anthropic marketplace, so `claude plugin marketplace add` is refused until access is granted. Meanwhile, load the plugin from the clone in each session that needs it:

```
claude --plugin-dir <clone>/plugins/toolkit
```

New sessions load the files as they are on disk; update with `git pull`.

## Install from the marketplace (once allowed)

Git must already reach `github.com/dserri/claude-toolkit` (an SSH key or a stored HTTPS credential; Claude Code has no token of its own).

```
claude plugin marketplace add dserri/claude-toolkit
claude plugin install toolkit@claude-toolkit
```

Then enable auto-update for `claude-toolkit` in `/plugin` → Marketplaces. The plugin declares no version, so every pushed commit is a release; sessions pick it up at the next start or after `/reload-plugins`. To update by hand:

```
claude plugin marketplace update claude-toolkit
claude plugin update toolkit@claude-toolkit
```

Roll back with `claude plugin uninstall toolkit@claude-toolkit`, or stop passing `--plugin-dir`.

## Develop

```
node --test
```

The tests include `claude plugin validate`, so `claude` must be on `PATH`. Loading with `--plugin-dir` and the untouched SDD installation are verified by hand, not by these tests.
