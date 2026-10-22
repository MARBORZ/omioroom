import type { User } from "@omioroom/contracts";

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
  updateLastSeen(id: string, timestamp: string): Promise<void>;
}

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async save(user: User): Promise<void> {
    this.users.set(user.id, { ...user });
  }

  async updateLastSeen(id: string, timestamp: string): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.lastSeenAt = timestamp;
      user.updatedAt = timestamp;
    }
  }
}
