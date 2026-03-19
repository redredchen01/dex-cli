# Changelog

## 1.0.0 (2026-03-19)

### Features

- **CLI**: `dex review`, `dex commit-msg`, `dex explain`, `dex refactor`, `dex test-gen`, `dex fix`
- **Tool Use**: Multi-turn agentic workflows with `bash`, `read_file`, `write_file`, `list_files`
- **`dex fix`**: Agentic skill that reads code, writes fixes, and runs tests autonomously
- **`dex chat`**: Interactive multi-turn conversation with full tool access
- **ACP Server**: `dex serve` for Zed/JetBrains editor integration via stdio JSON-RPC
- **Skill System**: Extensible plugin architecture with `dex skill init/add/remove`
- **Pipe Support**: `git diff | dex review`, `cat file | dex explain`
- **Shell Completions**: `dex completion bash|zsh|fish`
- **`dex doctor`**: System diagnostics and setup verification
- **Spinner UX**: Animated progress during context collection and API calls
- **Retry Logic**: Automatic retry with exponential backoff on rate limits/server errors
- **Large Diff Truncation**: Auto-truncate diffs >40K chars to prevent token budget issues
- **Token Usage**: `--verbose` shows input/output tokens and turn count
- **`--json` Output**: Structured JSON for `config list/get/set` and error messages
- **Security**: Path traversal protection on all file operations and skill management

### Built-in Skills

| Skill | Command | Tools |
|-------|---------|-------|
| review | `dex review [--staged]` | — |
| commit-msg | `dex commit-msg` | — |
| explain | `dex explain [file]` | — |
| refactor | `dex refactor <file>` | — |
| test-gen | `dex test-gen <file>` | — |
| fix | `dex fix <file> [-i "issue"]` | bash, read_file, write_file, list_files |

### Infrastructure

- TypeScript strict mode
- tsup bundling (29 kB package)
- 133+ tests across 21 test suites
- GitHub Actions CI (Node 20 + 22)
