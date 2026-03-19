import Anthropic from "@anthropic-ai/sdk";
import type { DexConfig } from "./config.js";
import type { AgentMessage } from "../skills/types.js";
import type { ToolDefinition } from "./tools.js";
import { toAnthropicToolSchema } from "./tools.js";
import { AgentError } from "./errors.js";

// ── Provider interface ──────────────────────────────────────────────

export interface ProviderMessage {
  role: "user" | "assistant";
  content: string | ProviderContentBlock[];
}

export type ProviderContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

export interface ProviderStreamResult {
  textDeltas: AsyncIterable<string>;
  /** Resolves once the full response is available. */
  finish(): Promise<ProviderFinishResult>;
}

export interface ProviderFinishResult {
  content: ProviderContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface ModelProvider {
  createStream(
    model: string,
    system: string,
    messages: ProviderMessage[],
    tools?: ToolDefinition[],
    maxTokens?: number,
  ): ProviderStreamResult;
}

// ── Anthropic Provider ──────────────────────────────────────────────

export class AnthropicProvider implements ModelProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  createStream(
    model: string,
    system: string,
    messages: ProviderMessage[],
    tools?: ToolDefinition[],
    maxTokens?: number,
  ): ProviderStreamResult {
    const anthropicTools = tools?.length
      ? tools.map(toAnthropicToolSchema)
      : undefined;

    const stream = this.client.messages.stream({
      model,
      max_tokens: maxTokens ?? 8192,
      system,
      messages: messages as Anthropic.MessageParam[],
      ...(anthropicTools ? { tools: anthropicTools } : {}),
    });

    const textDeltas = (async function* () {
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield event.delta.text;
        }
      }
    })();

    return {
      textDeltas,
      async finish(): Promise<ProviderFinishResult> {
        const msg = await stream.finalMessage();
        const content: ProviderContentBlock[] = [];
        for (const block of msg.content) {
          if (block.type === "text") {
            content.push({ type: "text" as const, text: block.text });
          } else if (block.type === "tool_use") {
            content.push({
              type: "tool_use" as const,
              id: block.id,
              name: block.name,
              input: block.input,
            });
          }
          // skip thinking/redacted_thinking blocks
        }
        return {
          content,
          stopReason: msg.stop_reason ?? "end_turn",
          usage: {
            inputTokens: msg.usage.input_tokens,
            outputTokens: msg.usage.output_tokens,
          },
        };
      },
    };
  }
}

// ── OpenAI Provider (fetch-based, no SDK) ───────────────────────────

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAIChoice {
  message: {
    role: string;
    content: string | null;
    tool_calls?: OpenAIToolCall[];
  };
  finish_reason: string;
}

interface OpenAIStreamDelta {
  role?: string;
  content?: string | null;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

interface OpenAIStreamChoice {
  delta: OpenAIStreamDelta;
  finish_reason: string | null;
}

function openAIToolSchema(tool: ToolDefinition) {
  return {
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  };
}

export class OpenAIProvider implements ModelProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = "https://api.openai.com/v1") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  createStream(
    model: string,
    system: string,
    messages: ProviderMessage[],
    tools?: ToolDefinition[],
    maxTokens?: number,
  ): ProviderStreamResult {
    const openaiMessages = this.convertMessages(system, messages);
    const openaiTools = tools?.length
      ? tools.map(openAIToolSchema)
      : undefined;

    const body: Record<string, unknown> = {
      model,
      messages: openaiMessages,
      max_tokens: maxTokens ?? 8192,
      stream: true,
    };
    if (openaiTools) {
      body.tools = openaiTools;
    }

    // We collect everything during streaming so finish() can return it.
    let fullText = "";
    const toolCalls = new Map<
      number,
      { id: string; name: string; args: string }
    >();
    let finishReason = "stop";
    let resolveFinished!: () => void;
    const finished = new Promise<void>((r) => {
      resolveFinished = r;
    });

    const apiKey = this.apiKey;
    const baseUrl = this.baseUrl;

    const textDeltas = (async function* () {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new AgentError(
          `OpenAI API error ${resp.status}: ${errText}`,
        );
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop()!;

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") continue;

            let parsed: { choices: OpenAIStreamChoice[]; usage?: { prompt_tokens: number; completion_tokens: number } };
            try {
              parsed = JSON.parse(data);
            } catch {
              continue;
            }

            const choice = parsed.choices?.[0];
            if (!choice) continue;

            if (choice.finish_reason) {
              finishReason = choice.finish_reason;
            }

            const delta = choice.delta;
            if (delta.content) {
              fullText += delta.content;
              yield delta.content;
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (!toolCalls.has(tc.index)) {
                  toolCalls.set(tc.index, {
                    id: tc.id ?? "",
                    name: tc.function?.name ?? "",
                    args: "",
                  });
                }
                const entry = toolCalls.get(tc.index)!;
                if (tc.id) entry.id = tc.id;
                if (tc.function?.name) entry.name = tc.function.name;
                if (tc.function?.arguments)
                  entry.args += tc.function.arguments;
              }
            }
          }
        }
      } finally {
        resolveFinished();
      }
    })();

    return {
      textDeltas,
      async finish(): Promise<ProviderFinishResult> {
        await finished;
        const content: ProviderContentBlock[] = [];
        if (fullText) {
          content.push({ type: "text", text: fullText });
        }
        for (const [, tc] of toolCalls) {
          let parsedInput: unknown = {};
          try {
            parsedInput = JSON.parse(tc.args);
          } catch {
            parsedInput = {};
          }
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: parsedInput,
          });
        }

        const stopReason =
          finishReason === "tool_calls"
            ? "tool_use"
            : finishReason === "stop"
              ? "end_turn"
              : finishReason === "length"
                ? "max_tokens"
                : finishReason;

        return {
          content,
          stopReason,
          usage: { inputTokens: 0, outputTokens: 0 },
        };
      },
    };
  }

  private convertMessages(
    system: string,
    messages: ProviderMessage[],
  ): unknown[] {
    const out: unknown[] = [];
    if (system) {
      out.push({ role: "system", content: system });
    }
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        out.push({ role: msg.role, content: msg.content });
      } else {
        // Blocks: handle tool_use (assistant) and tool_result (user)
        if (msg.role === "assistant") {
          const text = msg.content
            .filter((b) => b.type === "text")
            .map((b) => (b as { type: "text"; text: string }).text)
            .join("");
          const toolCallsArr = msg.content
            .filter((b) => b.type === "tool_use")
            .map((b) => {
              const tu = b as {
                type: "tool_use";
                id: string;
                name: string;
                input: unknown;
              };
              return {
                id: tu.id,
                type: "function",
                function: {
                  name: tu.name,
                  arguments: JSON.stringify(tu.input),
                },
              };
            });
          out.push({
            role: "assistant",
            content: text || null,
            ...(toolCallsArr.length ? { tool_calls: toolCallsArr } : {}),
          });
        } else {
          // user role with tool_result blocks
          for (const block of msg.content) {
            if (block.type === "tool_result") {
              const tr = block as {
                type: "tool_result";
                tool_use_id: string;
                content: string;
              };
              out.push({
                role: "tool",
                tool_call_id: tr.tool_use_id,
                content: tr.content,
              });
            } else if (block.type === "text") {
              out.push({
                role: "user",
                content: (block as { type: "text"; text: string }).text,
              });
            }
          }
        }
      }
    }
    return out;
  }
}

// ── Ollama Provider (fetch-based, OpenAI-compatible) ────────────────

export class OllamaProvider implements ModelProvider {
  private host: string;

  constructor(host: string = "http://localhost:11434") {
    this.host = host.replace(/\/$/, "");
  }

  createStream(
    model: string,
    system: string,
    messages: ProviderMessage[],
    tools?: ToolDefinition[],
    maxTokens?: number,
  ): ProviderStreamResult {
    const ollamaMessages = this.convertMessages(system, messages);
    const ollamaTools = tools?.length
      ? tools.map(openAIToolSchema)
      : undefined;

    const body: Record<string, unknown> = {
      model,
      messages: ollamaMessages,
      stream: true,
    };
    if (ollamaTools) {
      body.tools = ollamaTools;
    }
    if (maxTokens) {
      body.options = { num_predict: maxTokens };
    }

    let fullText = "";
    const toolCalls: Array<{ id: string; name: string; args: string }> = [];
    let resolveFinished!: () => void;
    const finished = new Promise<void>((r) => {
      resolveFinished = r;
    });

    const host = this.host;

    const textDeltas = (async function* () {
      const resp = await fetch(`${host}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new AgentError(
          `Ollama API error ${resp.status}: ${errText}`,
        );
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop()!;

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            let parsed: {
              message?: { content?: string; tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }> };
              done?: boolean;
            };
            try {
              parsed = JSON.parse(trimmed);
            } catch {
              continue;
            }

            if (parsed.message?.content) {
              fullText += parsed.message.content;
              yield parsed.message.content;
            }

            if (parsed.message?.tool_calls) {
              for (const tc of parsed.message.tool_calls) {
                toolCalls.push({
                  id: `call_${Date.now()}_${toolCalls.length}`,
                  name: tc.function.name,
                  args: JSON.stringify(tc.function.arguments),
                });
              }
            }
          }
        }
      } finally {
        resolveFinished();
      }
    })();

    return {
      textDeltas,
      async finish(): Promise<ProviderFinishResult> {
        await finished;
        const content: ProviderContentBlock[] = [];
        if (fullText) {
          content.push({ type: "text", text: fullText });
        }
        for (const tc of toolCalls) {
          let parsedInput: unknown = {};
          try {
            parsedInput = JSON.parse(tc.args);
          } catch {
            parsedInput = {};
          }
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: parsedInput,
          });
        }

        return {
          content,
          stopReason: toolCalls.length > 0 ? "tool_use" : "end_turn",
          usage: { inputTokens: 0, outputTokens: 0 },
        };
      },
    };
  }

  private convertMessages(
    system: string,
    messages: ProviderMessage[],
  ): unknown[] {
    const out: unknown[] = [];
    if (system) {
      out.push({ role: "system", content: system });
    }
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        out.push({ role: msg.role, content: msg.content });
      } else {
        if (msg.role === "assistant") {
          const text = msg.content
            .filter((b) => b.type === "text")
            .map((b) => (b as { type: "text"; text: string }).text)
            .join("");
          out.push({ role: "assistant", content: text || "" });
        } else {
          for (const block of msg.content) {
            if (block.type === "tool_result") {
              const tr = block as {
                type: "tool_result";
                tool_use_id: string;
                content: string;
              };
              out.push({
                role: "tool",
                content: tr.content,
              });
            }
          }
        }
      }
    }
    return out;
  }
}

// ── Factory ─────────────────────────────────────────────────────────

export function getProvider(config: DexConfig): ModelProvider {
  const providerName = (config.provider as string) ?? "anthropic";

  switch (providerName) {
    case "anthropic": {
      const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new AgentError(
          "Missing API key. Set ANTHROPIC_API_KEY environment variable or run: dex config set apiKey <your-key>",
        );
      }
      return new AnthropicProvider(apiKey);
    }

    case "openai": {
      const apiKey = config.openaiApiKey as string | undefined ?? process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new AgentError(
          "Missing OpenAI API key. Set OPENAI_API_KEY environment variable or run: dex config set openaiApiKey <your-key>",
        );
      }
      return new OpenAIProvider(apiKey);
    }

    case "ollama": {
      const host =
        (config.ollamaHost as string) ?? "http://localhost:11434";
      return new OllamaProvider(host);
    }

    default:
      throw new AgentError(
        `Unknown provider "${providerName}". Supported: anthropic, openai, ollama`,
      );
  }
}
