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
   * `UserPresence` 테이블 upsert (`isOnline`, `sessionId`, `lastSeen`).
   * `sessionId`가 `undefined`이면 필드를 생략하고, `null`이면 DB에 `null`로 반영합니다.
   * `DBConnectionManager.getInstance()`로 클라이언트를 사용합니다.
   */
  async upsertPresence(
    userId: string,
    isOnline: boolean,
    sessionId?: string | null
  ): Promise<void> {
    const lastSeen = new Date().toISOString();

    const row: Pick<UserPresence, "userId" | "isOnline"> & {
      lastSeen: string;
      sessionId?: string | null;
    } = {
      userId,
      isOnline,
      lastSeen,
    };
    if (sessionId !== undefined) {
      row.sessionId = sessionId;
    }

    const { error } = await UserPresenceRepository.db
      .from("UserPresence")
      .upsert(row, { onConflict: "userId" });

    if (error) {
      console.error("[UserPresenceRepository.upsertPresence]", error.message);
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
        .select("userId, isOnline, sessionId, lastSeen")
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
          sessionId: null,
          lastSeen: null,
        };

    return { user, presence };
  }
}
