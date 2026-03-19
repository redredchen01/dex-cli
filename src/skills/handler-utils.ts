import type { AgentInterface, AgentQueryOptions } from "./types.js";

export async function streamQuery(
  agent: AgentInterface,
  prompt: string,
  options: AgentQueryOptions,
): Promise<void> {
  for await (const msg of agent.query(prompt, options)) {
    if (msg.type === "text" && msg.content) {
      process.stdout.write(msg.content);
    }
  }
  process.stdout.write("\n");
}
