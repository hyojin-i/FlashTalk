export interface UserPresence {
    userId: string;
    isOnline: boolean;
    lastSeen?: string | Date | null;
}
