import { UserPresenceRepository } from "@/repositories/UserPresenceRepository";
import type { UserSearchResultDTO } from "@/entities/User";
import { isPresenceEffectivelyOnline } from "@/lib/presence";

export class UserSearchController {
  constructor(
    private readonly presenceRepository: UserPresenceRepository = new UserPresenceRepository()
  ) {}

  /**
   * 학번·학교로 사용자와 접속 상태를 조회해 `UserSearchResultDTO`를 반환합니다.
   * 마지막 heartbeat가 2분을 초과하면 오프라인으로 간주합니다.
   * 해당 사용자가 없으면 `null`을 반환합니다.
   */
  async searchUser(
    studentId: string,
    universityName: string
  ): Promise<UserSearchResultDTO | null> {
    const row = await this.presenceRepository.checkUserOnlineByStuIdAndUniName(
      studentId.trim(),
      universityName.trim()
    );
    if (!row) return null;

    const isOnline = isPresenceEffectivelyOnline(
      row.presence.isOnline,
      row.presence.lastSeen
    );

    return {
      userId: row.user.userId,
      studentId: row.user.studentId ?? "",
      name: row.user.name ?? "",
      universityName: row.user.universityName,
      isOnline,
    };
  }
}
