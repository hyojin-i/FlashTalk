import type { ParticipantsDTO } from "@/entities/Participants";

/** 메인 화면 사이드바 채팅방 목록 항목 */
export interface ChatRoomListItemDTO {
  roomId: string;
  participants: ParticipantsDTO[];
  createdAt: string;
}
