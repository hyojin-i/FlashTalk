import type { Message } from "@/domain/message/Message";
import { MessageFactory } from "@/domain/message/MessageFactory";
import type { ChatRoom } from "@/entities/ChatRoom";
import type { ChatRoomListItemDTO } from "@/entities/ChatRoomListItem";
import type { ParticipantsDTO } from "@/entities/Participants";
import { broadcastMessageToRoom } from "@/lib/message-broadcast";
import { normalizeUserId } from "@/lib/presence-channel";
import { broadcastInviteToRoom } from "@/lib/room-invite-broadcast";
import { ChatRoomRepository } from "@/repositories/ChatRoomRepository";
import { UserRepository } from "@/repositories/UserRepository";

export class ChatRoomParticipantRequiredError extends Error {
  readonly name = "ChatRoomParticipantRequiredError";
  constructor() {
    super("At least one participant is required");
  }
}

export class ChatRoomController {
  constructor(
    private readonly repository: ChatRoomRepository = new ChatRoomRepository(),
    private readonly userRepository: UserRepository = new UserRepository()
  ) {}

  /**
   * 참가자 목록으로 채팅방을 조회·생성하고 `roomId`를 반환합니다.
   * 1:1(참가자 2명)이면 기존 방이 있으면 재사용합니다.
   */
  async createRoom(
    userIdList: string[],
    inviterUserId: string
  ): Promise<string> {
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

    const inviterId = normalizeUserId(inviterUserId);
    const invitedUserIds = memberIds.filter((id) => id !== inviterId);
    const inviterUsers = await this.userRepository.getUserInfo([inviterId]);
    const inviter = inviterUsers[0];
    const inviterName =
      inviter?.name?.trim() || inviter?.studentId?.trim() || "알 수 없음";

    try {
      await broadcastInviteToRoom(invitedUserIds, {
        roomId: chatRoom.roomId,
        inviterUserId: inviterId,
        inviterName,
      });
    } catch (e) {
      console.error("[ChatRoomController.createRoom] invite broadcast failed", e);
    }

    return chatRoom.roomId;
  }

  /** 본인이 참여 중인 채팅방 목록과 상대 참가자 정보를 반환합니다. */
  async getRoomList(myUserId: string): Promise<ChatRoomListItemDTO[]> {
    const rooms = await this.repository.findRoomsByUserId(myUserId);

    return Promise.all(
      rooms.map(async (room) => ({
        roomId: room.roomId,
        participants: await this.getParticipantsInfo(room.roomId, myUserId),
        createdAt: room.createdAt.toISOString(),
      }))
    );
  }

  /**
   * 채팅방 참가자 중 본인을 제외한 상대 정보를 반환합니다.
   * 상대가 없으면 DB 조회 없이 빈 배열을 반환합니다.
   */
  async getParticipantsInfo(
    roomId: string,
    myUserId: string
  ): Promise<ParticipantsDTO[]> {
    const roomParticipants =
      await this.repository.findParticipantsByRoomId(roomId);

    const targetUserIds = roomParticipants
      .map((p) => p.userId)
      .filter((id) => id !== myUserId);

    if (targetUserIds.length === 0) {
      return [];
    }

    const users = await this.userRepository.getUserInfo(targetUserIds);

    return users.map((user) => ({
      userId: user.userId,
      studentId: user.studentId,
      name: user.name?.trim() || user.studentId,
    }));
  }

  /** Creates a message and broadcasts it to the chat room channel. */
  async sendMessage(
    roomId: string,
    userId: string,
    type: string,
    content: string
  ): Promise<Message> {
    const normalizedType = type.trim().toLowerCase();

    if (normalizedType === "text") {
      const trimmedContent = content.trim();
      if (!trimmedContent) {
        throw new Error("Message content is required");
      }

      const message = MessageFactory.createMessage(
        "text",
        trimmedContent,
        userId,
        roomId
      );

      await broadcastMessageToRoom(roomId, message);
      return message;
    }

    if (normalizedType === "file") {
      const trimmedContent = content.trim();
      if (!trimmedContent) {
        throw new Error("File message content is required");
      }

      const message = MessageFactory.createMessage(
        "file",
        trimmedContent,
        userId,
        roomId
      );

      await broadcastMessageToRoom(roomId, message);
      return message;
    }

    throw new Error("Unsupported message type");
  }
}
