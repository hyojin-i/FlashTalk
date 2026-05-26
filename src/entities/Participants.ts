/** 채팅방 참가자 표시용 DTO (본인 제외) */
export interface ParticipantsDTO {
  userId: string;
  studentId: string;
  name: string;
  isOnline: boolean;
}
