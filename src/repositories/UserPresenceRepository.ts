import type { UserPresence } from "@/entities/UserPresence";
import { DBConnectionManager } from "@/lib/DBConnectionManager";

export class UserPresenceRepository {
  private static get db() {
    return DBConnectionManager.getInstance().getClient();
  }

  /**
   * `UserPresence` 테이블 upsert (`isOnline` boolean, `sessionId` 선택).
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
