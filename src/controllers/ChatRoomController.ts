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
   * 선택된 사용자와 호스트를 포함한 채팅방을 생성하고 `roomId`를 반환합니다.
   */
  async createChatRoom(
    hostUserId: string,
    selectedUserIds: string[]
  ): Promise<string> {
    if (selectedUserIds.length === 0) {
      throw new ChatRoomParticipantRequiredError();
    }

    const memberIds = [
      ...new Set([hostUserId, ...selectedUserIds.map((id) => id.trim())]),
    ];
    return this.repository.createRoomWithParticipants(memberIds);
  }
}
