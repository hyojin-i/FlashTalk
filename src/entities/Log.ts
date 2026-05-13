export interface Log {
    id: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    timestamp: Date;
    // 로그 엔티티 속성
}
