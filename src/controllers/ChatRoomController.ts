import type { ChatRoom } from "@/entities/ChatRoom";
import { ChatRoomRepository } from "@/repositories/ChatRoomRepository";

export class ChatRoomParticipantRequiredError extends Error {
  readonly name = "ChatRoomParticipantRequiredError";
  constructor() {
    super("At least one participant is required");
  }
}

export class ChatRoomController {
  constructor(
    private readonly repository: ChatRoomRepository = new ChatRoomRepository()
  ) {}

  /**
   * 참가자 목록으로 채팅방을 조회·생성하고 `roomId`를 반환합니다.
   * 1:1(참가자 2명)이면 기존 방이 있으면 재사용합니다.
   */
  async createRoom(userIdList: string[]): Promise<string> {
    const memberIds = [
      ...new Set(userIdList.map((id) => id.trim()).filter(Boolean)),
    ];

    if (memberIds.length < 2) {
      throw new ChatRoomParticipantRequiredError();
    }

    if (memberIds.length === 2) {
      const existingRoomId = await this.repository.findExistingOneOnOneRoom(
        memberIds[0],
        memberIds[1]
      );
      if (existingRoomId) return existingRoomId;
    }

    const chatRoom: ChatRoom = await this.repository.createChatRoom(memberIds);
    await this.repository.insertParticipant(chatRoom.roomId, memberIds);
    return chatRoom.roomId;
  }
}
