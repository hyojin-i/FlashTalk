export interface Log {
    logId: string;
    timestamp: Date;
    logLevel: string;
    actionType: string;
    triggeredBy?: string | null;
    message: string;
}
