# claude-toolkit

Private Claude Code plugin marketplace (`claude-toolkit`) with one plugin, `toolkit`. See [README.md](README.md) for install, update and rollback.

## Layout

| Path | Contents |
|---|---|
| `.claude-plugin/marketplace.json` | Marketplace catalogue; plugins are listed by relative `source` |
| `plugins/toolkit/.claude-plugin/plugin.json` | Plugin manifest; no `version`, so each pushed commit is a release |
| `plugins/toolkit/skills/<name>/` | Skills, invoked as `/toolkit:<name>` |
| `tests/` | `node --test` structural checks |
| `openspec/` | OpenSpec specs and changes |

## Rules

- Build on top of SDD, never change it: no SDD files, rules, skills or agents here, and no skill or agent named `sdd`.
- A push reaches every installed machine at its next update: run `node --test` and `claude plugin validate .` before committing.
- `create-coordinator` scripts are UTF-8 with a byte order mark (Windows PowerShell 5.1 reads them as ANSI otherwise); its SKILL.md lists further rules for changing it. Its files are pinned by SHA-256 in `tests/toolkit.test.mjs`: a deliberate change updates those hashes in the same commit.
- `.gitattributes` keeps LF line endings so checkouts on Windows stay byte-identical.
