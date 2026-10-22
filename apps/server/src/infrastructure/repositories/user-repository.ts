import type { User } from "@omioroom/contracts";

export interface UserCredential {
  userId: string;
  normalizedUsername: string;
  passwordHash: string;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByNormalizedName(normalizedName: string): Promise<User | null>;
  save(user: User): Promise<void>;
  updateLastSeen(id: string, timestamp: string): Promise<void>;
  saveCredential(credential: UserCredential): Promise<void>;
  findCredentialByUsername(normalizedUsername: string): Promise<UserCredential | null>;
}

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();
  private readonly credentials = new Map<string, UserCredential>();

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async findByNormalizedName(normalizedName: string): Promise<User | null> {
    for (const u of this.users.values()) {
      if (u.normalizedName === normalizedName) {
        return u;
      }
    }
    return null;
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

  async saveCredential(credential: UserCredential): Promise<void> {
    this.credentials.set(credential.normalizedUsername, { ...credential });
  }

  async findCredentialByUsername(normalizedUsername: string): Promise<UserCredential | null> {
    return this.credentials.get(normalizedUsername) ?? null;
  }
}
