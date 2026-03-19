# Changelog

## 1.1.0 (2026-03-19)

### New Features

- **`dex create-skill`**: AI-powered skill generator — describe what you want, AI creates manifest + handler
- **`dex pr`**: Generate pull request descriptions from branch diff
- **`dex login` / `dex logout`**: Interactive API key setup with browser launch and validation
- **`dex chat`**: Interactive multi-turn conversation with full tool access
- **Markdown Rendering**: Streaming terminal markdown (bold, italic, code blocks, headers, lists)
- **`search_files` tool**: Grep-based search across project files with glob filtering
- **`apply_diff` tool**: Apply unified diff patches to files with validation

### Improvements

- Replaced Zod with manual validation (-8KB)
- Unified executor (DRY: executeSkill + executeSkillForAcp merged)
- Extracted `streamQuery` helper (removed 180 lines of handler boilerplate)
- Merged small utilities into `text.ts`
- Removed dead code (prompt.ts, getConfigValue, unused exports)

### Built-in Skills (8)

| Skill | Command | Tools |
|-------|---------|-------|
| review | `dex review [--staged]` | — |
| commit-msg | `dex commit-msg` | — |
| explain | `dex explain [file]` | — |
| refactor | `dex refactor <file>` | — |
| test-gen | `dex test-gen <file>` | — |
| fix | `dex fix <file> [-i "issue"]` | bash, read_file, write_file, list_files, search_files, apply_diff |
| pr | `dex pr [--base branch]` | — |
| create-skill | `dex create-skill <name> -d "desc"` | read_file, write_file, list_files, bash |

## 1.0.0 (2026-03-19)

Initial release. CLI with 6 skills, ACP server, skill system, pipe support, shell completions, doctor diagnostics, spinner UX, retry logic, token tracking, path traversal protection. 133+ tests.
