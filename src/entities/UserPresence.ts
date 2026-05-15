export interface UserPresence {
    userId: string;
    isOnline: boolean;
    sessionId?: string | null;
    lastSeen?: Date | null;
    // 사용자 접속 상태 엔티티 속성
}
