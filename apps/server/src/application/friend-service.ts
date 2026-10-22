import { getUserCapabilities, type FriendDto, type User } from "@omioroom/contracts";
import type { UserService } from "./user-service.js";

/** In-memory mutual friend links between registered users. Lost on server restart. */
export class FriendService {
  private readonly links = new Map<string, Set<string>>();

  constructor(private readonly userService: UserService) {}

  private assertCan(user: User): void {
    if (!getUserCapabilities(user.kind).canManageFriends) {
      throw new Error("FORBIDDEN");
    }
  }

  private link(a: string, b: string): void {
    if (!this.links.has(a)) this.links.set(a, new Set());
    this.links.get(a)!.add(b);
  }

  async list(user: User): Promise<FriendDto[]> {
    this.assertCan(user);
    const friends: FriendDto[] = [];
    for (const id of this.links.get(user.id) ?? []) {
      const friend = await this.userService.getUser(id);
      if (friend) friends.push({ userId: friend.id, displayName: friend.displayName });
    }
    return friends.sort((x, y) => x.displayName.localeCompare(y.displayName));
  }

  async add(user: User, username: string): Promise<FriendDto> {
    this.assertCan(user);
    const target = await this.userService.findRegisteredByUsername(username);
    if (!target) throw new Error("USER_NOT_FOUND");
    if (target.id === user.id) throw new Error("INVALID_PAYLOAD");
    this.link(user.id, target.id);
    this.link(target.id, user.id);
    return { userId: target.id, displayName: target.displayName };
  }

  async remove(user: User, friendId: string): Promise<void> {
    this.assertCan(user);
    this.links.get(user.id)?.delete(friendId);
    this.links.get(friendId)?.delete(user.id);
  }
}
