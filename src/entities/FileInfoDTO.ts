/** File metadata returned after upload (sent as chat message content). */
export interface FileInfoDTO {
  fileName: string;
  filePath: string;
  fileUrl: string;
  fileSize: number;
  userId: string;
}
