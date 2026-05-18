import { UserPresenceRepository } from "@/repositories/UserPresenceRepository";

export class UserPresenceController {
  constructor(
    private readonly repository: UserPresenceRepository = new UserPresenceRepository()
  ) {}

  /** `isOnline`과 `lastSeen`을 현재 시각으로 반영합니다. */
  async updatePresence(userId: string, isOnline: boolean): Promise<void> {
    await this.repository.upsertPresence(userId, isOnline);
  }

  /** 1분 주기 heartbeat: `lastSeen`만 갱신합니다. */
  async heartbeat(userId: string): Promise<void> {
    await this.repository.updateLastSeen(userId);
  }
}
