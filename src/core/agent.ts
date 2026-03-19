import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentInterface,
  AgentMessage,
  AgentQueryOptions,
} from "../skills/types.js";
import type { DexConfig } from "./config.js";
import { AgentError } from "./errors.js";
import {
  getToolsForSkill,
  toAnthropicToolSchema,
  executeToolCall,
} from "./tools.js";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("overloaded") ||
    msg.includes("529") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("timeout") ||
    msg.includes("econnreset")
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function createAgent(config: DexConfig): AgentInterface {
  let client: Anthropic | null = null;

  function getClient(): Anthropic {
    if (client) return client;
    const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new AgentError(
        "Missing API key. Set ANTHROPIC_API_KEY environment variable or run: dex config set apiKey <your-key>",
      );
    }
    client = new Anthropic({ apiKey });
    return client;
  }

  return {
    async *query(
      prompt: string,
      options?: AgentQueryOptions,
    ): AsyncGenerator<AgentMessage> {
      const anthropic = getClient();
      const model = config.model;
      const maxTokens =
        options?.maxTokens ?? (config.maxTokens as number) ?? 8192;
      const maxTurns = options?.maxTurns ?? 10;
      const toolDefs = getToolsForSkill(options?.tools);
      const hasTools = toolDefs.length > 0;
      const cwd = options?.cwd ?? process.cwd();
      const allowedTools = options?.tools ?? [];

      const anthropicTools = hasTools
        ? toolDefs.map(toAnthropicToolSchema)
        : undefined;

      const messages: Anthropic.MessageParam[] = [
        { role: "user", content: prompt },
      ];

      for (let turn = 0; turn < maxTurns; turn++) {
        // Retry loop for this turn
        let finalMessage: Anthropic.Message | null = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          if (attempt > 0) {
            const delay = RETRY_DELAYS[attempt - 1] ?? 4000;
            yield {
              type: "error",
              content: `Retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`,
            };
            await sleep(delay);
          }

          try {
            const stream = anthropic.messages.stream({
              model,
              max_tokens: maxTokens,
              system: options?.systemPrompt ?? "",
              messages,
              ...(anthropicTools ? { tools: anthropicTools } : {}),
            });

            // Stream text deltas for live output
            for await (const event of stream) {
              if (
                event.type === "content_block_delta" &&
                event.delta.type === "text_delta"
              ) {
                yield { type: "text", content: event.delta.text };
              }
            }

            finalMessage = await stream.finalMessage();
            break; // Success — exit retry loop
          } catch (err) {
            if (err instanceof AgentError) throw err;
            const error = err instanceof Error ? err : new Error(String(err));
            if (!isRetryable(err) || attempt === MAX_RETRIES) {
              yield { type: "error", content: error.message };
              throw new AgentError(error.message);
            }
          }
        }

        if (!finalMessage) {
          throw new AgentError("Failed to get response after retries");
        }

        // Check if the model wants to use tools
        if (finalMessage.stop_reason === "tool_use" && hasTools) {
          // Append assistant message to history
          messages.push({
            role: "assistant",
            content: finalMessage.content,
          });

          // Execute each tool call
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const block of finalMessage.content) {
            if (block.type === "tool_use") {
              yield {
                type: "tool_use",
                toolName: block.name,
                toolInput: block.input,
                toolCallId: block.id,
              };

              const result = await executeToolCall(
                block.name,
                block.input as Record<string, unknown>,
                cwd,
                allowedTools,
              );

              yield {
                type: "tool_result",
                content: result,
                toolCallId: block.id,
                toolName: block.name,
              };

              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: result,
              });
            }
          }

          // Append tool results and continue the loop
          messages.push({ role: "user", content: toolResults });
          continue;
        }

        // Model finished (end_turn or max_tokens) — done
        yield {
          type: "done",
          content: JSON.stringify({
            inputTokens: finalMessage.usage.input_tokens,
            outputTokens: finalMessage.usage.output_tokens,
            stopReason: finalMessage.stop_reason,
            turns: turn + 1,
          }),
        };
        return;
      }

      // Hit max turns
      yield {
        type: "error",
        content: `Reached maximum turns (${maxTurns})`,
      };
      yield { type: "done" };
    },
  };
}
