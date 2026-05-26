import type { Message } from "@/domain/message/Message";
import { MessageFactory } from "@/domain/message/MessageFactory";
import type { ChatRoom } from "@/entities/ChatRoom";
import type { ChatRoomListItemDTO } from "@/entities/ChatRoomListItem";
import type { InviteDTO } from "@/entities/InviteDTO";
import type { ParticipantsDTO } from "@/entities/Participants";
import type { ChatMessagePayload } from "@/lib/message-payload";
import { systemMessageToPayload } from "@/lib/message-payload";
import {
  broadcastMessageToRoom,
  broadcastPayloadToRoom,
} from "@/lib/message-broadcast";
import { formatInviteWelcomeContent } from "@/lib/invite-welcome";
import { normalizeUserId } from "@/lib/presence-channel";
import { broadcastInviteToRoom } from "@/lib/room-invite-broadcast";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { ChatRoomRepository } from "@/repositories/ChatRoomRepository";
import { FileInfoRepository } from "@/repositories/FileInfoRepository";
import { UserRepository } from "@/repositories/UserRepository";

const DEFAULT_STORAGE_BUCKET = "flashtalk-files";
const PARTNER_LEFT_MESSAGE = "대화 상대가 채팅방을 나갔습니다.";

export class ChatRoomParticipantRequiredError extends Error {
  readonly name = "ChatRoomParticipantRequiredError";
  constructor() {
    super("At least one participant is required");
  }
}

export class ChatRoomController {
  constructor(
    private readonly repository: ChatRoomRepository = new ChatRoomRepository(),
    private readonly userRepository: UserRepository = new UserRepository(),
    private readonly fileInfoRepository: FileInfoRepository = new FileInfoRepository()
  ) {}

  private storageBucketName(): string {
    return (
      process.env.SUPABASE_STORAGE_BUCKET?.trim() || DEFAULT_STORAGE_BUCKET
    );
  }

  private async cleanupRoomStorage(userIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) return;

    const filePaths =
      await this.fileInfoRepository.findFilePathsByUserIds(uniqueIds);

    if (filePaths.length > 0) {
      const supabase = getSupabaseAdminClient();
      const bucket = this.storageBucketName();
      const { error } = await supabase.storage.from(bucket).remove(filePaths);
      if (error) {
        console.error(
          "[ChatRoomController.cleanupRoomStorage]",
          error.message
        );
      }
    }

    await this.fileInfoRepository.deleteByUserIds(uniqueIds);
  }

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

  /**
   * 채팅방에 사용자를 초대하고 초대 알림·시스템 메시지를 브로드캐스트합니다.
   */
  async inviteUser(
    roomId: string,
    inviterId: string,
    inviteeIdList: string[]
  ): Promise<InviteDTO[]> {
    const normalizedRoomId = roomId.trim();
    const normalizedInviterId = normalizeUserId(inviterId);
    const inviteeIds = [
      ...new Set(
        inviteeIdList.map((id) => normalizeUserId(id)).filter(Boolean)
      ),
    ].filter((id) => id !== normalizedInviterId);

    if (!normalizedRoomId || !normalizedInviterId) {
      throw new Error("roomId and inviterId are required");
    }
    if (inviteeIds.length === 0) {
      throw new Error("inviteeIdList must contain at least one user");
    }

    const participants =
      await this.repository.findParticipantsByRoomId(normalizedRoomId);
    const isInviterMember = participants.some(
      (p) => p.userId === normalizedInviterId
    );
    if (!isInviterMember) {
      throw new Error("Not a participant of this chat room");
    }

    const existingIds = new Set(participants.map((p) => p.userId));
    const newInviteeIds = inviteeIds.filter((id) => !existingIds.has(id));
    if (newInviteeIds.length === 0) {
      throw new Error("All selected users are already in this chat room");
    }

    const inserted = await this.repository.insertParticipant(
      normalizedRoomId,
      newInviteeIds
    );
    if (inserted.length === 0) {
      throw new Error("Failed to add invitees to the chat room");
    }

    const inviterUsers = await this.userRepository.getUserInfo([
      normalizedInviterId,
    ]);
    const inviter = inviterUsers[0];
    const inviterName =
      inviter?.name?.trim() || inviter?.studentId?.trim() || "알 수 없음";

    const inviteeUsers = await this.userRepository.getUserInfo(
      inserted.map((p) => p.userId)
    );
    const inviteeById = new Map(inviteeUsers.map((user) => [user.userId, user]));
    const inviteeNameById = new Map(
      inviteeUsers.map((user) => [
        user.userId,
        user.name?.trim() || user.studentId?.trim() || "알 수 없음",
      ])
    );

    const invites: InviteDTO[] = inserted.map((participant) => ({
      roomId: normalizedRoomId,
      inviterName,
      inviteeId: participant.userId,
    }));

    try {
      await broadcastInviteToRoom(
        inserted.map((p) => p.userId),
        {
          roomId: normalizedRoomId,
          inviterUserId: normalizedInviterId,
          inviterName,
        }
      );
    } catch (e) {
      console.error("[ChatRoomController.inviteUser] invite broadcast failed", e);
    }

    for (const participant of inserted) {
      const invitee = inviteeById.get(participant.userId);
      const inviteeName =
        inviteeNameById.get(participant.userId) ?? "알 수 없음";
      const systemMessage = MessageFactory.createSystemMessage(
        "INVITE",
        `${inviteeName}님이 초대되었습니다.`
      );
      const payload: ChatMessagePayload = {
        ...systemMessageToPayload(systemMessage, normalizedRoomId),
        membershipUserId: participant.userId,
        membershipUserName: inviteeName,
        membershipStudentId: invitee?.studentId?.trim() ?? "",
      };
      try {
        await broadcastPayloadToRoom(normalizedRoomId, payload);
      } catch (e) {
        console.error(
          "[ChatRoomController.inviteUser] system message broadcast failed",
          e
        );
      }
    }

    return invites;
  }

  /**
   * 초대를 수락해 입장한 사용자의 입장 시스템 메시지를 채팅방 전체에 브로드캐스트합니다.
   */
  async announceInviteeEntry(
    roomId: string,
    userId: string
  ): Promise<ChatMessagePayload> {
    const normalizedRoomId = roomId.trim();
    const normalizedUserId = normalizeUserId(userId);

    if (!normalizedRoomId || !normalizedUserId) {
      throw new Error("roomId and userId are required");
    }

    const participants =
      await this.repository.findParticipantsByRoomId(normalizedRoomId);
    const isMember = participants.some((p) => p.userId === normalizedUserId);
    if (!isMember) {
      throw new Error("Not a participant of this chat room");
    }

    const users = await this.userRepository.getUserInfo([normalizedUserId]);
    const user = users[0];
    const userName =
      user?.name?.trim() || user?.studentId?.trim() || "알 수 없음";
    const content = formatInviteWelcomeContent(userName);

    const systemMessage = MessageFactory.createSystemMessage("JOIN", content);
    const payload: ChatMessagePayload = {
      ...systemMessageToPayload(systemMessage, normalizedRoomId),
      membershipUserId: normalizedUserId,
      membershipUserName: userName,
      membershipStudentId: user?.studentId?.trim() ?? "",
    };

    await broadcastPayloadToRoom(normalizedRoomId, payload);
    return payload;
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

  /** Removes a participant and broadcasts system messages or deletes an empty room. */
  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const normalizedRoomId = roomId.trim();
    const normalizedUserId = userId.trim();
    if (!normalizedRoomId || !normalizedUserId) {
      throw new Error("roomId and userId are required");
    }

    const participants =
      await this.repository.findParticipantsByRoomId(normalizedRoomId);
    const isMember = participants.some((p) => p.userId === normalizedUserId);
    if (!isMember) {
      throw new Error("Not a participant of this chat room");
    }

    const leaverUsers = await this.userRepository.getUserInfo([
      normalizedUserId,
    ]);
    const leaver = leaverUsers[0];
    const leftUserName =
      leaver?.name?.trim() || leaver?.studentId?.trim() || "알 수 없음";

    const allUserIds = participants.map((p) => p.userId);

    await this.repository.deleteParticipant(
      normalizedRoomId,
      normalizedUserId
    );

    const remaining = await this.repository.countParticipants(normalizedRoomId);

    if (remaining === 0) {
      await this.cleanupRoomStorage(allUserIds);
      await this.repository.deleteRoom(normalizedRoomId);
      return;
    }

    const content =
      remaining === 1
        ? PARTNER_LEFT_MESSAGE
        : `${leftUserName}님이 나갔습니다.`;

    const systemPayload: ChatMessagePayload = {
      id: crypto.randomUUID(),
      senderId: "",
      createdAt: new Date().toISOString(),
      type: "system",
      content,
      actionType: "USER_LEFT",
      leftUserId: normalizedUserId,
      leftUserName,
      remainingCount: remaining,
    };

    await broadcastPayloadToRoom(normalizedRoomId, systemPayload);
  }
}
