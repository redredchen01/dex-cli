import type { SkillHandler } from "../../types.js";

const SYSTEM_PROMPT = `You are an expert at writing comprehensive tests. Generate tests for the provided code.

Guidelines:
- Cover happy path, edge cases, and error cases
- Use descriptive test names that explain the expected behavior
- Mock external dependencies appropriately
- Include both unit tests and integration tests where applicable
- Output complete, runnable test files`;

const handler: SkillHandler = async (ctx) => {
  const file = ctx.context.currentFile;
  if (!file) {
    throw new Error("File not found. Check the path and try again.");
  }

  const framework = (ctx.flags.framework as string) || "vitest";

  const prompt = `Generate tests for \`${file.path}\` using ${framework}:

\`\`\`
${file.content}
\`\`\`

${ctx.context.packageJson ? `package.json dependencies:\n${JSON.stringify(ctx.context.packageJson.dependencies ?? {}, null, 2)}` : ""}
${ctx.context.fileTree ? `Project structure:\n\`\`\`\n${ctx.context.fileTree}\n\`\`\`` : ""}`;

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
