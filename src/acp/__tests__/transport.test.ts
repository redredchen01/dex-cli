import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStdioTransport } from "../transport.js";
import type { JsonRpcResponse } from "../types.js";

describe("createStdioTransport", () => {
  let stdoutChunks: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let writeSpy: any;

  beforeEach(() => {
    stdoutChunks = [];
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it("should parse valid JSON-RPC request and send response", async () => {
    const handler = vi.fn().mockResolvedValue({
      jsonrpc: "2.0" as const,
      id: 1,
      result: { ok: true },
    });

    const transport = createStdioTransport(handler);
    transport.start();

    // Simulate input via stdin
    process.stdin.emit("data", '{"jsonrpc":"2.0","method":"test","id":1}\n');

    await new Promise((r) => setTimeout(r, 20));

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonrpc: "2.0",
        method: "test",
        id: 1,
      }),
    );

    const output = stdoutChunks.join("");
    expect(output).toContain('"result":{"ok":true}');
    transport.stop();
  });

  it("should handle parse errors", async () => {
    const handler = vi.fn();
    const transport = createStdioTransport(handler);
    transport.start();

    process.stdin.emit("data", "not-json\n");
    await new Promise((r) => setTimeout(r, 20));

    expect(handler).not.toHaveBeenCalled();
    const output = stdoutChunks.join("");
    expect(output).toContain("-32700");
    expect(output).toContain("Parse error");
    transport.stop();
  });

  it("should reject invalid jsonrpc version", async () => {
    const handler = vi.fn();
    const transport = createStdioTransport(handler);
    transport.start();

    process.stdin.emit("data", '{"jsonrpc":"1.0","method":"test","id":1}\n');
    await new Promise((r) => setTimeout(r, 20));

    expect(handler).not.toHaveBeenCalled();
    const output = stdoutChunks.join("");
    expect(output).toContain("Invalid Request");
    transport.stop();
  });

  it("should reject request without method", async () => {
    const handler = vi.fn();
    const transport = createStdioTransport(handler);
    transport.start();

    process.stdin.emit("data", '{"jsonrpc":"2.0","id":1}\n');
    await new Promise((r) => setTimeout(r, 20));

    expect(handler).not.toHaveBeenCalled();
    const output = stdoutChunks.join("");
    expect(output).toContain("Invalid Request");
    transport.stop();
  });

  it("should not call process.exit on stop", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const handler = vi.fn();
    const transport = createStdioTransport(handler);
    transport.start();
    transport.stop();

    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});
