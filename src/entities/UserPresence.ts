export interface UserPresence {
    userId: string;
    status: 'online' | 'offline' | 'away';
    lastSeen: Date;
    // 사용자 접속 상태 엔티티 속성
}
