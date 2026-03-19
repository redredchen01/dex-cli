import type { SkillHandler } from "../../types.js";
import { streamQuery } from "../../handler-utils.js";

const SYSTEM_PROMPT = `You are an expert at writing git commit messages. Write a concise, conventional commit message for the provided changes.

Follow the Conventional Commits format:
<type>(<scope>): <description>

<body>

Types: feat, fix, refactor, docs, test, chore, style, perf, ci, build
- Keep the subject line under 72 characters
- Use imperative mood ("add" not "added")
- The body should explain WHY, not WHAT (the diff shows what)

Output ONLY the commit message, nothing else.`;

const handler: SkillHandler = async (ctx) => {
  const diff = ctx.context.gitDiffStaged;

  if (!diff) {
    ctx.logger.info("No staged changes. Stage your changes with `git add` first.");
    return;
  }

  const prompt = `Generate a commit message for these staged changes:

\`\`\`diff
${diff}
\`\`\`

${ctx.context.gitLog ? `Recent commit history for style reference:\n${ctx.context.gitLog}` : ""}`;

  await streamQuery(ctx.agent, prompt, { systemPrompt: SYSTEM_PROMPT });
};

export default handler;
