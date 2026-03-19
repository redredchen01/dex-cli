import type { AgentInterface, AgentQueryOptions } from "./types.js";
import { createMarkdownRenderer } from "../utils/markdown.js";

export async function streamQuery(
  agent: AgentInterface,
  prompt: string,
  options: AgentQueryOptions,
): Promise<void> {
  const useMd = process.stdout.isTTY === true;
  const renderer = useMd ? createMarkdownRenderer() : null;

  for await (const msg of agent.query(prompt, options)) {
    if (msg.type === "text" && msg.content) {
      if (renderer) {
        renderer.write(msg.content);
      } else {
        process.stdout.write(msg.content);
      }
    }
  }

  if (renderer) {
    renderer.flush();
  }
  process.stdout.write("\n");
}
