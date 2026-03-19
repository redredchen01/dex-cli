import { describe, it, expect, vi, afterEach } from "vitest";
import { createSpinner } from "../spinner.js";

describe("createSpinner", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should create a spinner with start/stop methods", () => {
    const spinner = createSpinner();
    expect(typeof spinner.start).toBe("function");
    expect(typeof spinner.stop).toBe("function");
    expect(typeof spinner.succeed).toBe("function");
    expect(typeof spinner.fail).toBe("function");
    expect(typeof spinner.update).toBe("function");
  });

  it("should not crash when not a TTY", () => {
    // In test env, stderr is not a TTY
    const spinner = createSpinner();
    expect(() => {
      spinner.start("test");
      spinner.update("updated");
      spinner.succeed("done");
    }).not.toThrow();
  });

  it("should not crash on double stop", () => {
    const spinner = createSpinner();
    spinner.start("test");
    spinner.stop();
    spinner.stop(); // Should not throw
  });

  it("should write to stderr for non-TTY", () => {
    const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const spinner = createSpinner();
    spinner.start("loading");

    expect(spy).toHaveBeenCalledWith(expect.stringContaining("loading"));
  });
});
