import { describe, it, expect, vi, afterEach } from "vitest";
import { readStdin } from "../stdin.js";

describe("readStdin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return null when stdin is a TTY", async () => {
    // isTTY is a plain property, not a getter
    const original = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: true, writable: true });
    try {
      const result = await readStdin();
      expect(result).toBeNull();
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: original, writable: true });
    }
  });
});
