import type { Session } from "@omioroom/contracts";

export interface SessionRepository {
  findById(id: string): Promise<Session | null>;
  findValidSession(id: string, now: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  revoke(id: string, now: string): Promise<void>;
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, Session>();

  async findById(id: string): Promise<Session | null> {
    return this.sessions.get(id) ?? null;
  }

  async findValidSession(id: string, now: string): Promise<Session | null> {
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.revokedAt) return null;
    if (new Date(session.expiresAt).getTime() <= new Date(now).getTime()) {
      return null;
    }
    return session;
  }

  async save(session: Session): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  async revoke(id: string, now: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      session.revokedAt = now;
    }
  }
}
