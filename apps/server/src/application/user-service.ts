import type { User } from "@omioroom/contracts";
import { normalizeDisplayName } from "@omioroom/contracts";
import type { UserRepository } from "../infrastructure/repositories/user-repository.js";
import type { Clock } from "../infrastructure/clock/system-clock.js";
import { generateId, hashSecret, verifySecret } from "../infrastructure/security/crypto.js";

const ADJECTIVES = ["retro", "quiet", "analog", "cozy", "neon", "amber", "vhs", "velvet", "chroma", "tape"];
const NOUNS = ["fox", "tiger", "bear", "hawk", "pilot", "echo", "runner", "signal", "ghost", "watcher"];

function generateRandomName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)] ?? "retro";
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)] ?? "watcher";
  const num = Math.floor(100 + Math.random() * 900);
  return `${adj}-${noun}-${num}`;
}

export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly clock: Clock
  ) {}

  async createAnonymousUser(initialDisplayName?: string): Promise<User> {
    const id = generateId();
    const displayName = initialDisplayName?.trim() || generateRandomName();
    const now = this.clock.isoNow();

    const user: User = {
      id,
      kind: initialDisplayName ? "nickname" : "anonymous",
      displayName,
      normalizedName: normalizeDisplayName(displayName),
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    };

    await this.userRepository.save(user);
    return user;
  }

  async updateDisplayName(userId: string, newDisplayName: string): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    const trimmed = newDisplayName.trim();
    const now = this.clock.isoNow();

    const updated: User = {
      ...user,
      kind: "nickname",
      displayName: trimmed,
      normalizedName: normalizeDisplayName(trimmed),
      updatedAt: now,
    };

    await this.userRepository.save(updated);
    return updated;
  }

  async registerUser(
    currentUserId: string,
    username: string,
    password: string
  ): Promise<User> {
    const trimmed = username.trim();
    const normalized = normalizeDisplayName(trimmed);

    // Check if username already exists
    const existing = await this.userRepository.findByNormalizedName(normalized);
    if (existing && existing.id !== currentUserId && existing.kind === "registered") {
      throw new Error("USERNAME_TAKEN");
    }

    const now = this.clock.isoNow();
    const existingUser = await this.userRepository.findById(currentUserId);
    const userId = existingUser ? existingUser.id : generateId();

    const registeredUser: User = {
      id: userId,
      kind: "registered",
      displayName: trimmed,
      normalizedName: normalized,
      createdAt: existingUser?.createdAt || now,
      updatedAt: now,
      lastSeenAt: now,
    };

    await this.userRepository.save(registeredUser);

    // Save hashed password
    const passwordHash = hashSecret(password);
    await this.userRepository.saveCredential({
      userId,
      normalizedUsername: normalized,
      passwordHash,
    });

    return registeredUser;
  }

  async authenticateUser(username: string, password: string): Promise<User> {
    const normalized = normalizeDisplayName(username);
    const credential = await this.userRepository.findCredentialByUsername(normalized);
    if (!credential) {
      throw new Error("INVALID_CREDENTIALS");
    }

    const isValid = verifySecret(password, credential.passwordHash);
    if (!isValid) {
      throw new Error("INVALID_CREDENTIALS");
    }

    const user = await this.userRepository.findById(credential.userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    await this.touchLastSeen(user.id);
    return user;
  }

  async getUser(userId: string): Promise<User | null> {
    return this.userRepository.findById(userId);
  }

  async touchLastSeen(userId: string): Promise<void> {
    await this.userRepository.updateLastSeen(userId, this.clock.isoNow());
  }
}
