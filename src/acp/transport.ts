import { createInterface } from "node:readline";
import type { JsonRpcRequest, JsonRpcResponse } from "./types.js";

export type RequestHandler = (
  request: JsonRpcRequest,
) => Promise<JsonRpcResponse>;

export interface StdioTransport {
  start(): void;
  stop(): void;
  send(response: JsonRpcResponse): void;
  onClose?: () => void;
}

export function createStdioTransport(handler: RequestHandler): StdioTransport {
  let rl: ReturnType<typeof createInterface> | null = null;

  const transport: StdioTransport = {
    send(response: JsonRpcResponse): void {
      process.stdout.write(JSON.stringify(response) + "\n");
    },

    start(): void {
      rl = createInterface({
        input: process.stdin,
        terminal: false,
      });

      rl.on("line", async (line) => {
        if (!line.trim()) return;

        try {
          const request = JSON.parse(line) as JsonRpcRequest;

          if (request.jsonrpc !== "2.0" || !request.method) {
            transport.send({
              jsonrpc: "2.0",
              id: request.id ?? 0,
              error: {
                code: -32600,
                message: "Invalid Request",
              },
            });
            return;
          }

          const response = await handler(request);
          transport.send(response);
        } catch {
          transport.send({
            jsonrpc: "2.0",
            id: 0,
            error: {
              code: -32700,
              message: "Parse error",
            },
          });
        }
      });

      rl.on("close", () => {
        if (transport.onClose) {
          transport.onClose();
        }
      });
    },

    stop(): void {
      if (rl) {
        rl.removeAllListeners("close");
        rl.close();
        rl = null;
      }
    },
  };

  return transport;
}
