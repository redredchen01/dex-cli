import { describe, it, expect, vi, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { join } from "node:path";

function dex(args: string[]): string {
  const binPath = join(process.cwd(), "bin", "dex.ts");
  try {
    return execSync(`npx tsx "${binPath}" ${args.join(" ")} 2>&1`, {
      encoding: "utf-8",
      timeout: 15000,
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
  } catch (err: any) {
    return err.stdout ?? "";
  }
}

describe("dex doctor", () => {
  it("should check Node.js version", () => {
    const output = dex(["doctor"]);
    expect(output).toContain("Node.js");
    expect(output).toContain(process.version);
  });

  it("should check Git installation", () => {
    const output = dex(["doctor"]);
    expect(output).toContain("Git");
    expect(output).toContain("git version");
  });

  it("should check skills loaded count", () => {
    const output = dex(["doctor"]);
    expect(output).toContain("Skills loaded");
    expect(output).toContain("built-in");
  });

  it("should show check results with icons", () => {
    const output = dex(["doctor"]);
    // Should have at least some ✔ checks
    expect(output).toContain("✔");
  });
});

describe("dex completion", () => {
  it("should output bash completion script", () => {
    const output = dex(["completion", "bash"]);
    expect(output).toContain("_dex_completions");
    expect(output).toContain("complete -F");
    expect(output).toContain("review");
  });

  it("should output zsh completion script", () => {
    const output = dex(["completion", "zsh"]);
    expect(output).toContain("#compdef dex");
    expect(output).toContain("_dex");
    expect(output).toContain("review");
  });

  it("should output fish completion script", () => {
    const output = dex(["completion", "fish"]);
    expect(output).toContain("complete -c dex");
    expect(output).toContain("review");
  });
});
