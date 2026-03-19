import type { SkillHandler } from "../../types.js";

const SYSTEM_PROMPT = `You are an expert software engineer specializing in code refactoring. Analyze the provided code and suggest improvements.

Focus on:
- Code smells and anti-patterns
- Opportunities for simplification
- Better abstractions or patterns
- Improved naming
- Performance improvements

For each suggestion:
1. Describe the issue
2. Show the refactored code
3. Explain the benefit`;

const handler: SkillHandler = async (ctx) => {
  const file = ctx.context.currentFile;
  if (!file) {
    throw new Error("File not found. Check the path and try again.");
  }

  const prompt = `Suggest refactoring improvements for \`${file.path}\`:

\`\`\`
${file.content}
\`\`\`

${ctx.context.fileTree ? `Project structure for context:\n\`\`\`\n${ctx.context.fileTree}\n\`\`\`` : ""}`;

  for await (const msg of ctx.agent.query(prompt, {
    systemPrompt: SYSTEM_PROMPT,
  })) {
    if (msg.type === "text" && msg.content) {
      process.stdout.write(msg.content);
    }
  }
  process.stdout.write("\n");
};

export default handler;
