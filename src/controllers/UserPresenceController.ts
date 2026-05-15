import { UserPresenceRepository } from "@/repositories/UserPresenceRepository";

export class UserPresenceController {
  constructor(
    private readonly repository: UserPresenceRepository = new UserPresenceRepository()
  ) {}

  /**
   * `UserPresence` 엔티티에 맞게 `isOnline`·`sessionId`·`lastSeen`을 반영합니다.
   * `sessionId`를 생략하면 해당 필드는 건드리지 않고, `null`이면 DB에서 제거(클리어)합니다.
   */
  async updatePresence(
    userId: string,
    isOnline: boolean,
    sessionId?: string | null
  ): Promise<void> {
    await this.repository.upsertPresence(userId, isOnline, sessionId);
  }
}
