import { describe, it, expect, vi } from "vitest";
import { streamQuery } from "../handler-utils.js";

describe("streamQuery", () => {
  it("should write text messages to stdout", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const agent = {
      async *query() {
        yield { type: "text" as const, content: "hello " };
        yield { type: "text" as const, content: "world" };
        yield { type: "done" as const };
      },
    };

    await streamQuery(agent as any, "prompt", { systemPrompt: "sys" });

    expect(writeSpy).toHaveBeenCalledWith("hello ");
    expect(writeSpy).toHaveBeenCalledWith("world");
    expect(writeSpy).toHaveBeenCalledWith("\n");
    writeSpy.mockRestore();
  });

  it("should skip non-text messages", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const agent = {
      async *query() {
        yield { type: "tool_use" as const, toolName: "bash" };
        yield { type: "text" as const, content: "result" };
        yield { type: "done" as const };
      },
    };

    await streamQuery(agent as any, "test", {});

    expect(writeSpy).toHaveBeenCalledWith("result");
    writeSpy.mockRestore();
  });
});
