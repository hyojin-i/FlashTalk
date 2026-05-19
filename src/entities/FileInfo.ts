export interface FileInfo {
    fileId: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    fileType: string;
    userId: string;
    uploadedAt: Date;
    downloadedAt?: Date;
}
