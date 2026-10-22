import type { RoomAccessRepository, RoomPrivateAccessRecord } from "../infrastructure/repositories/room-access-repository.js";
import type { Clock } from "../infrastructure/clock/system-clock.js";
import { generatePrivateCode, hashSecret, verifySecret } from "../infrastructure/security/crypto.js";

export class RoomAccessService {
  constructor(
    private readonly accessRepository: RoomAccessRepository,
    private readonly clock: Clock
  ) {}

  async createPrivateAccess(roomId: string): Promise<{ privateCode: string; access: RoomPrivateAccessRecord }> {
    const privateCode = generatePrivateCode(8);
    const secretHash = hashSecret(privateCode);
    const now = this.clock.isoNow();

    const access: RoomPrivateAccessRecord = {
      roomId,
      secretHash,
      rotatedAt: now,
      revokedAt: null,
    };

    await this.accessRepository.save(access);
    return { privateCode, access };
  }

  async verifyAccess(roomId: string, candidateCode?: string): Promise<boolean> {
    if (!candidateCode) return false;
    const access = await this.accessRepository.findByRoomId(roomId);
    if (!access || access.revokedAt) return false;

    return verifySecret(candidateCode.trim(), access.secretHash);
  }

  async rotatePrivateAccess(roomId: string): Promise<string> {
    const { privateCode } = await this.createPrivateAccess(roomId);
    return privateCode;
  }

  async revokePrivateAccess(roomId: string): Promise<void> {
    await this.accessRepository.revoke(roomId, this.clock.isoNow());
  }
}
