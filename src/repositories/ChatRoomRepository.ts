import { randomUUID } from "node:crypto";
import { DBConnectionManager } from "@/lib/DBConnectionManager";

export class ChatRoomRepository {
  private static get db() {
    return DBConnectionManager.getInstance().getClient();
  }

  async createRoomWithParticipants(userIds: string[]): Promise<string> {
    const roomId = randomUUID();
    const now = new Date().toISOString();

    const { error: roomError } = await ChatRoomRepository.db
      .from("ChatRoom")
      .insert({
        id: roomId,
        name: "",
        createdAt: now,
      });

    if (roomError) {
      console.error("[ChatRoomRepository.createRoomWithParticipants]", roomError.message);
      throw new Error(roomError.message);
    }

    const participants = userIds.map((userId) => ({
      roomId,
      userId,
      joinedAt: now,
    }));

    const { error: participantError } = await ChatRoomRepository.db
      .from("RoomParticipant")
      .insert(participants);

    if (participantError) {
      console.error("[ChatRoomRepository.createRoomWithParticipants]", participantError.message);
      throw new Error(participantError.message);
    }

    return roomId;
  }
}
