import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "../logger.js";

describe("Logger", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("should log at info level by default", () => {
    const logger = createLogger();
    logger.info("test message");
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("should suppress debug when level is info", () => {
    const logger = createLogger("info");
    logger.debug("hidden");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("should show debug when level is debug", () => {
    const logger = createLogger("debug");
    logger.debug("visible");
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("should always show errors", () => {
    const logger = createLogger("error");
    logger.debug("hidden");
    logger.info("hidden");
    logger.warn("hidden");
    logger.error("visible");
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("should include prefix in child logger", () => {
    const logger = createLogger("info", "parent");
    const child = logger.child("child");
    child.info("test");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[parent:child]"),
    );
  });

  it("should create child with just child prefix when no parent prefix", () => {
    const logger = createLogger("info");
    const child = logger.child("child");
    child.info("test");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[child]"),
    );
  });
});
