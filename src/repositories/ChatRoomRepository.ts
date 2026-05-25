import { randomUUID } from "node:crypto";
import type { ChatRoom } from "@/entities/ChatRoom";
import type { RoomParticipant } from "@/entities/RoomParticipant";
import { DBConnectionManager } from "@/lib/DBConnectionManager";

export class ChatRoomRepository {
  private static get db() {
    return DBConnectionManager.getInstance().getClient();
  }

  /**
   * user1·user2가 모두 참여하고 참가자가 정확히 2명인 1:1 방의 roomId를 반환합니다.
   * 없으면 null입니다.
   */
  async findExistingOneOnOneRoom(
    user1: string,
    user2: string
  ): Promise<string | null> {
    const { data: user1Rows, error: user1Error } = await ChatRoomRepository.db
      .from("RoomParticipant")
      .select("roomId")
      .eq("userId", user1);

    if (user1Error) {
      console.error(
        "[ChatRoomRepository.findExistingOneOnOneRoom]",
        user1Error.message
      );
      throw new Error(user1Error.message);
    }

    const user1RoomIds = new Set(
      (user1Rows ?? []).map((row) => row.roomId as string)
    );
    if (user1RoomIds.size === 0) return null;

    const { data: user2Rows, error: user2Error } = await ChatRoomRepository.db
      .from("RoomParticipant")
      .select("roomId")
      .eq("userId", user2);

    if (user2Error) {
      console.error(
        "[ChatRoomRepository.findExistingOneOnOneRoom]",
        user2Error.message
      );
      throw new Error(user2Error.message);
    }

    const commonRoomIds = (user2Rows ?? [])
      .map((row) => row.roomId as string)
      .filter((roomId) => user1RoomIds.has(roomId));

    if (commonRoomIds.length === 0) return null;

    const { data: participantRows, error: participantError } =
      await ChatRoomRepository.db
        .from("RoomParticipant")
        .select("roomId")
        .in("roomId", commonRoomIds);

    if (participantError) {
      console.error(
        "[ChatRoomRepository.findExistingOneOnOneRoom]",
        participantError.message
      );
      throw new Error(participantError.message);
    }

    const countByRoomId = new Map<string, number>();
    for (const row of participantRows ?? []) {
      const roomId = row.roomId as string;
      countByRoomId.set(roomId, (countByRoomId.get(roomId) ?? 0) + 1);
    }

    for (const roomId of commonRoomIds) {
      if (countByRoomId.get(roomId) === 2) return roomId;
    }

    return null;
  }

  /** `ChatRoom` 테이블에 새 방을 생성하고 생성된 `ChatRoom`을 반환합니다. */
  async createChatRoom(_userIdList: string[]): Promise<ChatRoom> {
    const roomId = randomUUID();
    const createdAt = new Date().toISOString();

    const { error: roomError } = await ChatRoomRepository.db
      .from("ChatRoom")
      .insert({
        roomId: roomId,
        createdAt,
      });

    if (roomError) {
      console.error("[ChatRoomRepository.createChatRoom]", roomError.message);
      throw new Error(roomError.message);
    }

    return {
      roomId,
      createdAt: new Date(createdAt),
    };
  }

  /** 사용자가 참여 중인 채팅방 목록 (최신 생성순) */
  async findRoomsByUserId(userId: string): Promise<ChatRoom[]> {
    const { data: participantRows, error: participantError } =
      await ChatRoomRepository.db
        .from("RoomParticipant")
        .select("roomId")
        .eq("userId", userId);

    if (participantError) {
      console.error(
        "[ChatRoomRepository.findRoomsByUserId]",
        participantError.message
      );
      throw new Error(participantError.message);
    }

    const roomIds = [
      ...new Set(
        (participantRows ?? []).map((row) => row.roomId as string).filter(Boolean)
      ),
    ];
    if (roomIds.length === 0) return [];

    const { data: roomRows, error: roomError } = await ChatRoomRepository.db
      .from("ChatRoom")
      .select("roomId, createdAt")
      .in("roomId", roomIds)
      .order("createdAt", { ascending: false });

    if (roomError) {
      console.error(
        "[ChatRoomRepository.findRoomsByUserId]",
        roomError.message
      );
      throw new Error(roomError.message);
    }

    return (roomRows ?? []).map((row) => ({
      roomId: row.roomId as string,
      createdAt: new Date(row.createdAt as string),
    }));
  }

  /** `roomId`에 속한 `RoomParticipant` 목록을 조회합니다. */
  async findParticipantsByRoomId(roomId: string): Promise<RoomParticipant[]> {
    const { data, error } = await ChatRoomRepository.db
      .from("RoomParticipant")
      .select("ParticipantId, userId, roomId, joinedAt")
      .eq("roomId", roomId);

    if (error) {
      console.error(
        "[ChatRoomRepository.findParticipantsByRoomId]",
        error.message
      );
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => ({
      ParticipantId: String(row.ParticipantId ?? ""),
      userId: row.userId as string,
      roomId: row.roomId as string,
      joinedAt: new Date(row.joinedAt as string),
    }));
  }

  /** `RoomParticipant`에서 해당 사용자를 삭제합니다. */
  async deleteParticipant(roomId: string, userId: string): Promise<void> {
    const { error } = await ChatRoomRepository.db
      .from("RoomParticipant")
      .delete()
      .eq("roomId", roomId)
      .eq("userId", userId);

    if (error) {
      console.error(
        "[ChatRoomRepository.deleteParticipant]",
        error.message
      );
      throw new Error(error.message);
    }
  }

  /** 채팅방 참가자 수를 반환합니다. */
  async countParticipants(roomId: string): Promise<number> {
    const { count, error } = await ChatRoomRepository.db
      .from("RoomParticipant")
      .select("ParticipantId", { count: "exact", head: true })
      .eq("roomId", roomId);

    if (error) {
      console.error(
        "[ChatRoomRepository.countParticipants]",
        error.message
      );
      throw new Error(error.message);
    }

    return count ?? 0;
  }

  /** `ChatRoom` 레코드를 삭제합니다 (CASCADE로 연관 데이터 정리). */
  async deleteRoom(roomId: string): Promise<void> {
    const { error } = await ChatRoomRepository.db
      .from("ChatRoom")
      .delete()
      .eq("roomId", roomId);

    if (error) {
      console.error("[ChatRoomRepository.deleteRoom]", error.message);
      throw new Error(error.message);
    }
  }

  /** `RoomParticipant` 테이블에 참가자 목록을 추가합니다. */
  async insertParticipant(roomId: string, userIdList: string[]): Promise<void> {
    const joinedAt = new Date().toISOString();
    const participants = userIdList.map((userId) => ({
      roomId,
      userId,
      joinedAt,
    }));

    const { error: participantError } = await ChatRoomRepository.db
      .from("RoomParticipant")
      .insert(participants);

    if (participantError) {
      console.error(
        "[ChatRoomRepository.insertParticipant]",
        participantError.message
      );
      throw new Error(participantError.message);
    }
  }
}
