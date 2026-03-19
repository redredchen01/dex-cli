import type { SkillHandler } from "../../types.js";

const SYSTEM_PROMPT = `You are an expert software engineer. Explain the provided code clearly and concisely.

Cover:
- Purpose and high-level overview
- Key functions/classes and their roles
- Important patterns or algorithms used
- Any notable design decisions

Use clear language accessible to intermediate developers.`;

const handler: SkillHandler = async (ctx) => {
  // Support piped input: `cat file.ts | dex explain`
  const code = ctx.context.currentFile?.content ?? ctx.context.stdin;
  const label = ctx.context.currentFile?.path ?? "stdin";

  if (!code) {
    throw new Error(
      "No code to explain. Provide a file path or pipe code: cat file.ts | dex explain",
    );
  }

  const prompt = `Explain this code from \`${label}\`:

\`\`\`
${code}
\`\`\``;

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
