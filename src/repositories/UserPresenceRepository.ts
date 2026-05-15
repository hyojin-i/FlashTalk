import type { UserPresence } from "@/entities/UserPresence";
import { DBConnectionManager } from "@/lib/DBConnectionManager";

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
}
