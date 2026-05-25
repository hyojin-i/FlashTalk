import type { FileInfo } from "@/entities/FileInfo";
import { DBConnectionManager } from "@/lib/DBConnectionManager";

export class FileInfoRepository {
  private static get db() {
    return DBConnectionManager.getInstance().getClient();
  }

  async findFilePathsByUserIds(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];

    const { data, error } = await FileInfoRepository.db
      .from("FileInfo")
      .select("filePath")
      .in("userId", userIds);

    if (error) {
      console.error("[FileInfoRepository.findFilePathsByUserIds]", error.message);
      throw new Error(error.message);
    }

    return (data ?? [])
      .map((row) => row.filePath as string)
      .filter(Boolean);
  }

  async deleteByUserIds(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;

    const { error } = await FileInfoRepository.db
      .from("FileInfo")
      .delete()
      .in("userId", userIds);

    if (error) {
      console.error("[FileInfoRepository.deleteByUserIds]", error.message);
      throw new Error(error.message);
    }
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
