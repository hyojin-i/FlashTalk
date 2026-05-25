import type { FileInfo } from "@/entities/FileInfo";
import { DBConnectionManager } from "@/lib/DBConnectionManager";

export class FileInfoRepository {
  private static get db() {
    return DBConnectionManager.getInstance().getClient();
  }

  async saveFileInfo(fileInfo: FileInfo): Promise<void> {
    const { error } = await FileInfoRepository.db.from("FileInfo").insert({
      fileId: fileInfo.fileId,
      fileName: fileInfo.fileName,
      filePath: fileInfo.filePath,
      fileSize: fileInfo.fileSize,
      fileType: fileInfo.fileType,
      userId: fileInfo.userId,
      uploadedAt: fileInfo.uploadedAt.toISOString(),
    });

    if (error) {
      console.error("[FileInfoRepository.saveFileInfo]", error.message);
      throw new Error(error.message);
    }
  }
}
