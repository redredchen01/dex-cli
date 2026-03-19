import type { SkillHandler } from "../../types.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { streamQuery } from "../../handler-utils.js";

const execFileAsync = promisify(execFile);

const SYSTEM_PROMPT = `You are an expert at writing pull request descriptions. Generate a clear, well-structured PR description in Markdown.

Use this format:

## Summary
- 2-3 bullet points explaining the purpose and motivation

## Changes
- List the key changes grouped logically
- Reference specific files when helpful

## Test plan
- [ ] Checklist items describing how to verify the changes

Output ONLY the PR description in Markdown, nothing else.`;

async function gitCommand(
  args: string[],
  cwd: string,
): Promise<string | null> {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
    });
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}

const handler: SkillHandler = async (ctx) => {
  const base = (ctx.flags.base as string) || "main";
  const cwd = ctx.context.cwd;

  const [commitLog, diffStat, fullDiff] = await Promise.all([
    gitCommand(["log", "--oneline", `${base}..HEAD`], cwd),
    gitCommand(["diff", `${base}...HEAD`, "--stat"], cwd),
    gitCommand(["diff", `${base}...HEAD`], cwd),
  ]);

  const diff = fullDiff || ctx.context.gitDiff;

  if (!diff && !commitLog) {
    ctx.logger.info(
      `No changes found between '${base}' and HEAD. Check that you are on a feature branch.`,
    );
    return;
  }

  const parts = [];

  if (commitLog) {
    parts.push(`Commits on this branch:\n${commitLog}`);
  }

  if (diffStat) {
    parts.push(`Changed files summary:\n${diffStat}`);
  }

  if (diff) {
    parts.push(`Full diff:\n\`\`\`diff\n${diff}\n\`\`\``);
  }

  if (ctx.context.fileTree) {
    parts.push(`Repository file tree:\n${ctx.context.fileTree}`);
  }

  const prompt = `Generate a pull request description for the following changes:\n\n${parts.join("\n\n")}`;

  await streamQuery(ctx.agent, prompt, { systemPrompt: SYSTEM_PROMPT });
};

export default handler;
