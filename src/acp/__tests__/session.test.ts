import { describe, it, expect } from "vitest";
import { SessionManager } from "../session.js";

describe("SessionManager", () => {
  it("should create a session", () => {
    const mgr = new SessionManager();
    const session = mgr.create("review");

    expect(session.id).toBeDefined();
    expect(session.skillName).toBe("review");
    expect(session.status).toBe("active");
  });

  it("should retrieve a session by id", () => {
    const mgr = new SessionManager();
    const session = mgr.create("review");

    expect(mgr.get(session.id)).toBe(session);
  });

  it("should return undefined for unknown id", () => {
    const mgr = new SessionManager();
    expect(mgr.get("nonexistent")).toBeUndefined();
  });

  it("should cancel a session", () => {
    const mgr = new SessionManager();
    const session = mgr.create("review");

    expect(mgr.cancel(session.id)).toBe(true);
    expect(mgr.get(session.id)!.status).toBe("cancelled");
  });

  it("should complete a session", () => {
    const mgr = new SessionManager();
    const session = mgr.create("review");

    mgr.complete(session.id);
    expect(mgr.get(session.id)!.status).toBe("completed");
  });

  it("should return false when cancelling unknown session", () => {
    const mgr = new SessionManager();
    expect(mgr.cancel("nope")).toBe(false);
  });

  it("should cleanup old sessions", () => {
    const mgr = new SessionManager();
    const session = mgr.create("review");

    // Force old timestamp
    session.createdAt = Date.now() - 60 * 60 * 1000;

    mgr.cleanup(30 * 60 * 1000);
    expect(mgr.get(session.id)).toBeUndefined();
  });

  it("should keep recent sessions during cleanup", () => {
    const mgr = new SessionManager();
    const session = mgr.create("review");

    mgr.cleanup(30 * 60 * 1000);
    expect(mgr.get(session.id)).toBeDefined();
  });
});
