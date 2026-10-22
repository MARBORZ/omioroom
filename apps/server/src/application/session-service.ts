import type { Session, User } from "@omioroom/contracts";
import type { SessionRepository } from "../infrastructure/repositories/session-repository.js";
import type { UserRepository } from "../infrastructure/repositories/user-repository.js";
import type { Clock } from "../infrastructure/clock/system-clock.js";
import { generateSessionToken } from "../infrastructure/security/crypto.js";

export class SessionService {
  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly userRepository: UserRepository,
    private readonly clock: Clock,
    private readonly sessionTtlMs: number
  ) {}

  async createSession(userId: string): Promise<Session> {
    const id = generateSessionToken();
    const now = this.clock.now();
    const createdAt = new Date(now).toISOString();
    const expiresAt = new Date(now + this.sessionTtlMs).toISOString();

    const session: Session = {
      id,
      userId,
      createdAt,
      expiresAt,
      revokedAt: null,
    };

    await this.sessionRepository.save(session);
    return session;
  }

  async validateSession(sessionId: string): Promise<{ session: Session; user: User } | null> {
    const nowIso = this.clock.isoNow();
    const session = await this.sessionRepository.findValidSession(sessionId, nowIso);
    if (!session) return null;

    const user = await this.userRepository.findById(session.userId);
    if (!user) return null;

    return { session, user };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.sessionRepository.revoke(sessionId, this.clock.isoNow());
  }
}
