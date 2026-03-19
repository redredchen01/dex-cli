import type { SkillHandler } from "../../types.js";
import { streamQuery } from "../../handler-utils.js";

const SYSTEM_PROMPT = `You are an expert code reviewer. Review the provided code changes and give actionable feedback.

Focus on:
- Bugs and logic errors
- Security vulnerabilities
- Performance issues
- Code style and readability
- Missing edge cases

Format your review as a list of findings, each with:
- Severity (critical / warning / suggestion)
- File and line reference
- Description of the issue
- Suggested fix

If the code looks good, say so briefly.`;

const handler: SkillHandler = async (ctx) => {
  const staged = ctx.flags.staged as boolean;

  // Support piped input: `git diff | dex review`
  const diff =
    ctx.context.stdin ??
    (staged ? ctx.context.gitDiffStaged : ctx.context.gitDiff);

  if (!diff) {
    ctx.logger.info(
      staged
        ? "No staged changes to review."
        : "No changes to review. Use --staged or pipe a diff: git diff | dex review",
    );
    return;
  }

  const prompt = `Review the following code changes:

\`\`\`diff
${diff}
\`\`\`

${ctx.context.fileTree ? `Project structure:\n\`\`\`\n${ctx.context.fileTree}\n\`\`\`` : ""}`;

  await streamQuery(ctx.agent, prompt, { systemPrompt: SYSTEM_PROMPT });
};

export default handler;
