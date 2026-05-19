export interface UserPresence {
    userId: string;
    isOnline: boolean;
    lastSeenAt?: Date | null;
}
