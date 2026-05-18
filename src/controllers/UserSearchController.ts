import { UserPresenceRepository } from "@/repositories/UserPresenceRepository";
import type { UserSearchResultDTO } from "@/entities/User";
import { isPresenceEffectivelyOnline } from "@/lib/presence";
import type { UserWithPresence } from "@/repositories/UserPresenceRepository";

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

    return this.toSearchResult(row);
  }

  /** 같은 학교 전체 가입자 목록 */
  async listUsers(universityName: string): Promise<UserSearchResultDTO[]> {
    const rows = await this.presenceRepository.listUsersByUniversity(
      universityName.trim()
    );
    return rows.map((row) => this.toSearchResult(row));
  }

  /** 학번·이름으로 같은 학교 사용자 검색 */
  async searchUsers(
    query: string,
    universityName: string
  ): Promise<UserSearchResultDTO[]> {
    const rows = await this.presenceRepository.searchUsersByQuery(
      query,
      universityName.trim()
    );
    return rows.map((row) => this.toSearchResult(row));
  }

  private toSearchResult(row: UserWithPresence): UserSearchResultDTO {
    return {
      userId: row.user.userId,
      studentId: row.user.studentId ?? "",
      name: row.user.name ?? "",
      universityName: row.user.universityName,
      isOnline: isPresenceEffectivelyOnline(
        row.presence.isOnline,
        row.presence.lastSeen
      ),
    };
  }
}
