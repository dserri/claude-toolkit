# claude-toolkit

Private Claude Code plugin marketplace (`claude-toolkit`) with one plugin, `toolkit`: a personal proof of concept for a multi-session coordinator workflow. See [README.md](README.md) for local use, install and update.

## Layout

| Path | Contents |
|---|---|
| `.claude-plugin/marketplace.json` | Marketplace catalogue; plugins are listed by relative `source` |
| `plugins/toolkit/.claude-plugin/plugin.json` | Plugin manifest; no `version`, so each pushed commit is a release |
| `plugins/toolkit/<component>/` | Plugin components at the plugin root (`skills/`, `agents/`, `hooks/`), invoked as `toolkit:<name>` |
| `tests/` | `node --test`: structural checks plus `claude plugin validate` (needs `claude` on `PATH`) |
| `openspec/` | OpenSpec specs and changes |

## Rules

- Compatible with SDD, separate from it: never change SDD files, rules, skills or agents, never name a skill or agent `sdd`, and use SDD only through its documented commands. Everything is written in English, like SDD.
- The organization's managed policy blocks non-official marketplaces, so sessions load this clone with `--plugin-dir plugins/toolkit`: every saved file, committed or not, is live in the next session started that way.
- A marketplace install receives every pushed commit: run `node --test` before committing.
- `.gitattributes` keeps LF line endings so checkouts on Windows stay byte-identical.
