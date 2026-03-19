import { randomUUID } from "node:crypto";
import type { AcpSession } from "./types.js";

export class SessionManager {
  private sessions = new Map<string, AcpSession>();

  create(skillName: string): AcpSession {
    const session: AcpSession = {
      id: randomUUID(),
      skillName,
      createdAt: Date.now(),
      status: "active",
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): AcpSession | undefined {
    return this.sessions.get(id);
  }

  cancel(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.status = "cancelled";
    return true;
  }

  complete(id: string): void {
    const session = this.sessions.get(id);
    if (session) session.status = "completed";
  }

  cleanup(maxAgeMs: number = 30 * 60 * 1000): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > maxAgeMs) {
        this.sessions.delete(id);
      }
    }
  }
}
