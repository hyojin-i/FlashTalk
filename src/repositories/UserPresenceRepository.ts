import type { User } from "@/entities/User";
import type { UserPresence } from "@/entities/UserPresence";
import { DBConnectionManager } from "@/lib/DBConnectionManager";

export type UserWithPresence = {
  user: User;
  presence: UserPresence;
};

export class UserPresenceRepository {
  private static get db() {
    return DBConnectionManager.getInstance().getClient();
  }

  /**
   * `UserPresence` 테이블 upsert (`isOnline`, `lastSeen`).
   * `DBConnectionManager.getInstance()`로 클라이언트를 사용합니다.
   */
  async upsertPresence(userId: string, isOnline: boolean): Promise<void> {
    const lastSeen = new Date().toISOString();

    const row = {
      userId,
      isOnline,
      lastSeen,
    };

    const { error } = await UserPresenceRepository.db
      .from("UserPresence")
      .upsert(row, { onConflict: "userId" });

    if (error) {
      console.error("[UserPresenceRepository.upsertPresence]", error.message);
      throw new Error(error.message);
    }
  }

  /** Heartbeat: `lastSeen`만 현재 시각으로 갱신합니다. */
  async updateLastSeen(userId: string): Promise<void> {
    const lastSeen = new Date().toISOString();
    const { error } = await UserPresenceRepository.db
      .from("UserPresence")
      .update({ lastSeen, isOnline: true })
      .eq("userId", userId);

    if (error) {
      console.error("[UserPresenceRepository.updateLastSeen]", error.message);
      throw new Error(error.message);
    }
  }

  /**
   * 학번·학교로 `User`를 조회한 뒤 `userId`로 `UserPresence`를 조인 조회합니다.
   * `DBConnectionManager.getInstance()`로 클라이언트를 사용합니다.
   */
  async checkUserOnlineByStuIdAndUniName(
    studentId: string,
    universityName: string
  ): Promise<UserWithPresence | null> {
    const { data: userRow, error: userError } =
      await UserPresenceRepository.db
        .from("User")
        .select("userId, studentId, name, universityName, role")
        .eq("studentId", studentId)
        .eq("universityName", universityName)
        .maybeSingle();

    if (userError) {
      throw new Error(userError.message);
    }
    if (!userRow) return null;

    const user = userRow as User;

    const { data: presenceRow, error: presenceError } =
      await UserPresenceRepository.db
        .from("UserPresence")
        .select("userId, isOnline, lastSeen")
        .eq("userId", user.userId)
        .maybeSingle();

    if (presenceError) {
      throw new Error(presenceError.message);
    }

    const presence: UserPresence = presenceRow
      ? (presenceRow as UserPresence)
      : {
          userId: user.userId,
          isOnline: false,
          lastSeen: null,
        };

    return { user, presence };
  }
}
