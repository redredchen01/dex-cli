import type { SkillHandler } from "../../types.js";

const SYSTEM_PROMPT = `You are an expert software engineer. Your task is to fix bugs and issues in code.

You have access to tools to read files, write files, list the project structure, and run bash commands.

Workflow:
1. Read the target file to understand the code
2. If needed, read related files for context
3. Identify the issue
4. Write the fix to the file
5. If there are tests, run them to verify your fix

Be precise with your changes. Only modify what's necessary to fix the issue.
After writing the fix, briefly explain what you changed and why.`;

const handler: SkillHandler = async (ctx) => {
  const file = ctx.context.currentFile;
  if (!file) {
    throw new Error("File not found. Check the path and try again.");
  }

  const issue = ctx.flags.issue as string | undefined;

  const prompt = `${issue ? `Fix this issue: ${issue}\n\n` : "Analyze and fix any bugs in "}the file \`${file.path}\`:

\`\`\`
${file.content}
\`\`\`

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
