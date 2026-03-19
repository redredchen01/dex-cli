# dex

AI development tool with extensible skill system and ACP protocol support.

## Install

```bash
npm install -g dex-cli
```

Requires Node.js >= 20 and an [Anthropic API key](https://console.anthropic.com/).

```bash
export ANTHROPIC_API_KEY=your-key-here
# or
dex config set apiKey your-key-here
```

## Quick Start

```bash
dex review              # Review uncommitted changes
dex review --staged     # Review staged changes only
dex commit-msg          # Generate a commit message
dex explain src/app.ts  # Explain a file
dex refactor src/old.ts # Get refactoring suggestions
dex test-gen src/api.ts # Generate tests
dex fix src/bug.ts      # Fix bugs with AI agent (tool use)
```

Pipe support:

```bash
git diff | dex review           # Pipe a diff
cat src/auth.ts | dex explain   # Pipe code
```

## Commands

| Command | Description |
|---------|-------------|
| `dex review [--staged]` | Code review |
| `dex commit-msg` | Generate commit message |
| `dex explain <file>` | Explain code |
| `dex refactor <file>` | Refactoring suggestions |
| `dex test-gen <file>` | Generate tests |
| `dex fix <file> [-i "issue"]` | Fix bugs with agentic tool use |
| `dex chat [--tools]` | Interactive AI chat with tool access |
| `dex run <skill>` | Run any skill by name |
| `dex serve` | Start ACP server for editor integration |
| `dex doctor` | Check system setup |
| `dex config list\|get\|set` | Manage configuration |
| `dex skill list\|info\|init\|add\|remove` | Manage skills |
| `dex completion bash\|zsh\|fish` | Shell completions |

### Global Flags

- `--verbose` / `-v` — Show debug output and token usage
- `--json` — Structured JSON output
- `--version` / `-V` — Show version

## Custom Skills

Create your own skills:

```bash
dex skill init my-skill    # Generate skeleton
cd my-skill
# Edit handler.ts and manifest.json
dex skill add .            # Install globally
dex my-skill               # Run it
```

### manifest.json

```json
{
  "name": "my-skill",
  "version": "1.0.0",
  "description": "My custom skill",
  "inputs": {
    "args": [{ "name": "file", "description": "Target file", "required": true }],
    "flags": [{ "name": "verbose", "type": "boolean", "default": false }],
    "context": ["current-file", "file-tree", "git-diff", "stdin"]
  },
  "agent": {
    "maxTurns": 5,
    "allowedTools": ["read_file", "write_file", "list_files", "bash"]
  }
}
```

### Available Context Sources

| Source | Description |
|--------|-------------|
| `git-diff` | Unstaged changes |
| `git-diff-staged` | Staged changes |
| `git-log` | Recent commit history |
| `file-tree` | Project directory tree |
| `current-file` | File specified by `file` arg |
| `package-json` | Project package.json |
| `stdin` | Piped input |

### Available Tools (for agentic skills)

| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands |
| `read_file` | Read file contents |
| `write_file` | Create/modify files |
| `list_files` | List directory tree |

## ACP Server (Editor Integration)

Start the ACP server for Zed, JetBrains, or other editors:

```bash
dex serve
```

The server communicates via stdio JSON-RPC 2.0. Configure your editor to use `dex serve` as an ACP agent.

### Supported Methods

- `initialize` — Returns capabilities and available skills
- `session/new` — Create a new session for a skill
- `session/prompt` — Execute a skill within a session
- `session/cancel` — Cancel an active session

## Shell Completions

```bash
# Bash
eval "$(dex completion bash)"

# Zsh
eval "$(dex completion zsh)"

# Fish
dex completion fish > ~/.config/fish/completions/dex.fish
```

## Configuration

```bash
dex config list              # Show all settings
dex config set model claude-opus-4-20250514  # Change model
dex config set maxTokens 16384              # Increase token limit
```

Settings are stored in `~/.dex/config.json` (global) and `.dex/config.json` (project).

Environment variables: `ANTHROPIC_API_KEY`, `DEX_MODEL`.

## License

MIT
