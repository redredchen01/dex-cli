import type { SkillHandler } from "../../types.js";
import { streamQuery } from "../../handler-utils.js";

const SYSTEM_PROMPT = `You are an expert at creating dex CLI skills. Your job is to generate a complete, working skill based on the user's description.

A dex skill consists of two files in a directory:

## 1. manifest.json

\`\`\`json
{
  "name": "skill-name",
  "version": "1.0.0",
  "description": "What this skill does",
  "inputs": {
    "args": [
      { "name": "file", "description": "Target file", "required": true }
    ],
    "flags": [
      { "name": "verbose", "short": "v", "type": "boolean", "default": false }
    ],
    "context": ["current-file", "git-diff", "git-diff-staged", "git-log", "file-tree", "package-json", "stdin"]
  },
  "agent": {
    "maxTurns": 5,
    "allowedTools": ["bash", "read_file", "write_file", "list_files", "search_files", "apply_diff"]
  },
  "aliases": ["short-name"]
}
\`\`\`

Rules:
- "name" must be lowercase with hyphens
- Only include "args", "flags", "context" that the skill actually needs
- Only include "agent.allowedTools" if the skill needs to read/write files or run commands
- Omit "agent" entirely for simple single-turn skills (review, explain, etc.)

## 2. handler.ts

\`\`\`typescript
import type { SkillHandler } from "../../types.js";
import { streamQuery } from "../../handler-utils.js";

const SYSTEM_PROMPT = \\\`Your system prompt here\\\`;

const handler: SkillHandler = async (ctx) => {
  // Access inputs:
  // ctx.args.file — positional arg
  // ctx.flags.verbose — flag value
  // ctx.context.gitDiff — context data
  // ctx.context.currentFile?.content — file content
  // ctx.context.stdin — piped input
  // ctx.context.cwd — working directory

  const prompt = \\\`Your prompt with \${ctx.context.currentFile?.content}\\\`;
  await streamQuery(ctx.agent, prompt, { systemPrompt: SYSTEM_PROMPT });
};

export default handler;
\`\`\`

## Your workflow:

1. Understand what the user wants
2. Design the manifest (what inputs, context, and tools are needed)
3. Write the handler with a good system prompt
4. Create the skill directory with write_file
5. If the user wants it installed, run: \`dex skill add ./<name>\`

Keep skills simple and focused. One skill = one job.`;

const handler: SkillHandler = async (ctx) => {
  const name = ctx.args.name;
  const description = ctx.flags.description as string | undefined;
  const install = ctx.flags.install as boolean;

  if (!name) {
    throw new Error("Skill name is required. Usage: dex create-skill <name> -d 'what it does'");
  }

  const prompt = `Create a new dex skill called "${name}" in the directory "./${name}/".

${description ? `Description: ${description}` : "Ask me what this skill should do, then create it."}

${install ? "After creating the files, install it by running: dex skill add ./" + name : ""}

${ctx.context.fileTree ? `Current project structure for reference:\n\`\`\`\n${ctx.context.fileTree}\n\`\`\`` : ""}

Create the manifest.json and handler.ts files now.`;

  await streamQuery(ctx.agent, prompt, { systemPrompt: SYSTEM_PROMPT });
};

export default handler;
